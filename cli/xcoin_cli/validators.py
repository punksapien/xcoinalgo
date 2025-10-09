"""
Validators for strategy code and configuration
"""

import ast
import json
import re
from pathlib import Path
from typing import List, Dict, Tuple, Any, Optional
from dataclasses import dataclass


@dataclass
class ValidationResult:
    """Result of a validation check"""
    is_valid: bool
    errors: List[str]
    warnings: List[str]
    info: List[str]


class SecurityScanner:
    """Scan Python code for security vulnerabilities"""

    # Dangerous imports that are not allowed
    FORBIDDEN_IMPORTS = {
        'os', 'sys', 'subprocess', 'eval', 'exec', 'compile',
        'open', '__import__', 'importlib', 'pickle', 'shelve',
        'socket', 'urllib', 'http', 'ftplib', 'smtplib',
        'multiprocessing', 'threading', 'asyncio.subprocess'
    }

    # Dangerous built-in functions
    FORBIDDEN_BUILTINS = {
        'eval', 'exec', 'compile', '__import__', 'open',
        'input', 'raw_input', 'execfile'
    }

    # Dangerous patterns (regex)
    DANGEROUS_PATTERNS = [
        (r'globals\(\)', 'Access to global namespace'),
        (r'locals\(\)', 'Access to local namespace'),
        (r'vars\(\)', 'Access to variable namespace'),
        (r'dir\(\)', 'Directory introspection'),
        (r'getattr\(', 'Dynamic attribute access'),
        (r'setattr\(', 'Dynamic attribute modification'),
        (r'delattr\(', 'Dynamic attribute deletion'),
    ]

    def scan(self, code: str) -> ValidationResult:
        """
        Scan Python code for security issues

        Args:
            code: Python source code as string

        Returns:
            ValidationResult with security findings
        """
        errors = []
        warnings = []
        info = []

        try:
            # Parse the AST
            tree = ast.parse(code)

            # Check imports
            import_errors = self._check_imports(tree)
            errors.extend(import_errors)

            # Check for forbidden built-ins
            builtin_errors = self._check_builtins(tree)
            errors.extend(builtin_errors)

            # Check for file operations
            file_errors = self._check_file_operations(tree)
            errors.extend(file_errors)

            # Check for dangerous patterns in source
            pattern_warnings = self._check_patterns(code)
            warnings.extend(pattern_warnings)

            # Check for network operations
            network_errors = self._check_network_operations(tree)
            errors.extend(network_errors)

            if not errors and not warnings:
                info.append("✓ No security issues detected")

        except SyntaxError as e:
            errors.append(f"Syntax error: {e.msg} at line {e.lineno}")
        except Exception as e:
            errors.append(f"Failed to parse code: {str(e)}")

        return ValidationResult(
            is_valid=len(errors) == 0,
            errors=errors,
            warnings=warnings,
            info=info
        )

    def _check_imports(self, tree: ast.AST) -> List[str]:
        """Check for forbidden imports"""
        errors = []

        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                for alias in node.names:
                    module_name = alias.name.split('.')[0]
                    if module_name in self.FORBIDDEN_IMPORTS:
                        errors.append(
                            f"Forbidden import '{alias.name}' at line {node.lineno}"
                        )

            elif isinstance(node, ast.ImportFrom):
                if node.module:
                    module_name = node.module.split('.')[0]
                    if module_name in self.FORBIDDEN_IMPORTS:
                        errors.append(
                            f"Forbidden import 'from {node.module}' at line {node.lineno}"
                        )

        return errors

    def _check_builtins(self, tree: ast.AST) -> List[str]:
        """Check for forbidden built-in functions"""
        errors = []

        for node in ast.walk(tree):
            if isinstance(node, ast.Call):
                if isinstance(node.func, ast.Name):
                    if node.func.id in self.FORBIDDEN_BUILTINS:
                        errors.append(
                            f"Forbidden built-in '{node.func.id}()' at line {node.lineno}"
                        )

        return errors

    def _check_file_operations(self, tree: ast.AST) -> List[str]:
        """Check for file I/O operations"""
        errors = []

        for node in ast.walk(tree):
            # Check for 'open()' calls
            if isinstance(node, ast.Call):
                if isinstance(node.func, ast.Name) and node.func.id == 'open':
                    errors.append(
                        f"File I/O operation 'open()' not allowed at line {node.lineno}"
                    )

            # Check for 'with open()' statements
            if isinstance(node, ast.With):
                for item in node.items:
                    if isinstance(item.context_expr, ast.Call):
                        if isinstance(item.context_expr.func, ast.Name):
                            if item.context_expr.func.id == 'open':
                                errors.append(
                                    f"File I/O operation 'with open()' not allowed at line {node.lineno}"
                                )

        return errors

    def _check_patterns(self, code: str) -> List[str]:
        """Check for dangerous patterns using regex"""
        warnings = []

        lines = code.split('\n')
        for i, line in enumerate(lines, 1):
            # Skip comments
            if line.strip().startswith('#'):
                continue

            for pattern, description in self.DANGEROUS_PATTERNS:
                if re.search(pattern, line):
                    warnings.append(
                        f"Line {i}: {description} - '{line.strip()}'"
                    )

        return warnings

    def _check_network_operations(self, tree: ast.AST) -> List[str]:
        """Check for network operations"""
        errors = []

        # Network modules that shouldn't be used
        network_modules = {'requests', 'urllib', 'http', 'httplib', 'urllib2', 'urllib3'}

        # Build a set of names that are network-related imports
        network_names = set()
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                for alias in node.names:
                    module_name = alias.name.split('.')[0]
                    if module_name in network_modules:
                        # Store the alias name if present, otherwise the module name
                        network_names.add(alias.asname if alias.asname else alias.name)

            elif isinstance(node, ast.ImportFrom):
                if node.module:
                    module_name = node.module.split('.')[0]
                    if module_name in network_modules:
                        for alias in node.names:
                            network_names.add(alias.asname if alias.asname else alias.name)

        # Now check for calls on these network objects
        for node in ast.walk(tree):
            if isinstance(node, ast.Call):
                if isinstance(node.func, ast.Attribute):
                    # Check if the object is one of the network imports
                    if isinstance(node.func.value, ast.Name):
                        if node.func.value.id in network_names:
                            errors.append(
                                f"Network operation '{node.func.value.id}.{node.func.attr}()' not allowed at line {node.lineno}"
                            )

        return errors


class SDKComplianceChecker:
    """Check if strategy complies with SDK requirements"""

    REQUIRED_FUNCTION = 'generate_signal'
    REQUIRED_BASE_CLASS = 'BaseStrategy'

    def check(self, code: str) -> ValidationResult:
        """
        Check SDK compliance

        Args:
            code: Python source code as string

        Returns:
            ValidationResult with compliance findings
        """
        errors = []
        warnings = []
        info = []

        try:
            tree = ast.parse(code)

            # Check for BaseStrategy class
            has_base_class = self._has_base_strategy(tree)
            if not has_base_class:
                errors.append("Missing 'BaseStrategy' class definition")
            else:
                info.append("✓ Found BaseStrategy class")

            # Check for strategy implementation class
            strategy_class = self._find_strategy_class(tree)
            if not strategy_class:
                errors.append("No strategy class inheriting from BaseStrategy found")
            else:
                info.append(f"✓ Found strategy class: {strategy_class}")

            # Check for generate_signal function
            has_generate_signal = self._has_generate_signal(tree)
            if not has_generate_signal:
                errors.append("Missing 'generate_signal()' function at module level")
            else:
                info.append("✓ Found generate_signal() entry point")

            # Check for proper method signature
            signature_errors = self._check_generate_signal_signature(tree)
            errors.extend(signature_errors)

            # Check for required imports
            import_warnings = self._check_required_imports(tree)
            warnings.extend(import_warnings)

            # Check for strategy instance creation
            has_instance = self._has_strategy_instance(tree)
            if not has_instance:
                warnings.append("No strategy instance found (e.g., 'strategy = MyStrategy()')")
            else:
                info.append("✓ Found strategy instance")

        except SyntaxError as e:
            errors.append(f"Syntax error: {e.msg} at line {e.lineno}")
        except Exception as e:
            errors.append(f"Failed to parse code: {str(e)}")

        return ValidationResult(
            is_valid=len(errors) == 0,
            errors=errors,
            warnings=warnings,
            info=info
        )

    def _has_base_strategy(self, tree: ast.AST) -> bool:
        """Check if BaseStrategy class is defined"""
        for node in ast.walk(tree):
            if isinstance(node, ast.ClassDef):
                if node.name == self.REQUIRED_BASE_CLASS:
                    return True
        return False

    def _find_strategy_class(self, tree: ast.AST) -> Optional[str]:
        """Find class that inherits from BaseStrategy"""
        for node in ast.walk(tree):
            if isinstance(node, ast.ClassDef):
                for base in node.bases:
                    if isinstance(base, ast.Name) and base.id == self.REQUIRED_BASE_CLASS:
                        return node.name
        return None

    def _has_generate_signal(self, tree: ast.AST) -> bool:
        """Check if generate_signal function exists at module level"""
        for node in tree.body:
            if isinstance(node, ast.FunctionDef):
                if node.name == self.REQUIRED_FUNCTION:
                    return True
        return False

    def _check_generate_signal_signature(self, tree: ast.AST) -> List[str]:
        """Check if generate_signal has correct signature"""
        errors = []

        # Check module-level function
        for node in tree.body:
            if isinstance(node, ast.FunctionDef) and node.name == self.REQUIRED_FUNCTION:
                args = node.args.args
                if len(args) < 2:
                    errors.append(
                        f"generate_signal() must accept at least 2 parameters (candles, settings)"
                    )
                else:
                    param_names = [arg.arg for arg in args]
                    if 'candles' not in param_names or 'settings' not in param_names:
                        errors.append(
                            f"generate_signal() parameters should be named 'candles' and 'settings'"
                        )

        return errors

    def _check_required_imports(self, tree: ast.AST) -> List[str]:
        """Check if required imports are present"""
        warnings = []

        imports = set()
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                for alias in node.names:
                    imports.add(alias.name)
            elif isinstance(node, ast.ImportFrom):
                if node.module:
                    imports.add(node.module)

        recommended_imports = {'pandas', 'numpy', 'typing'}
        missing = recommended_imports - imports

        if missing:
            warnings.append(f"Recommended imports not found: {', '.join(missing)}")

        return warnings

    def _has_strategy_instance(self, tree: ast.AST) -> bool:
        """Check if strategy instance is created"""
        for node in ast.walk(tree):
            if isinstance(node, ast.Assign):
                if isinstance(node.value, ast.Call):
                    if isinstance(node.value.func, ast.Name):
                        # Check if it's a class instantiation (capitalized name)
                        if node.value.func.id[0].isupper():
                            return True
        return False


class ConfigValidator:
    """Validate strategy configuration JSON"""

    REQUIRED_FIELDS = {
        'name': str,
        'code': str,
        'author': dict,
        'description': str,
        'pairs': list,
        'timeframes': list,
        'parameters': list,
        'riskProfile': dict,
    }

    def validate(self, config_path: Path) -> ValidationResult:
        """
        Validate configuration JSON

        Args:
            config_path: Path to config.json file

        Returns:
            ValidationResult with validation findings
        """
        errors = []
        warnings = []
        info = []

        try:
            # Read and parse JSON
            with open(config_path, 'r') as f:
                config = json.load(f)

            # Check required fields
            for field, field_type in self.REQUIRED_FIELDS.items():
                if field not in config:
                    errors.append(f"Missing required field: '{field}'")
                elif not isinstance(config[field], field_type):
                    errors.append(
                        f"Field '{field}' should be {field_type.__name__}, "
                        f"got {type(config[field]).__name__}"
                    )
                else:
                    info.append(f"✓ Field '{field}' is valid")

            # Validate author structure
            if 'author' in config:
                author_errors = self._validate_author(config['author'])
                errors.extend(author_errors)

            # Validate pairs
            if 'pairs' in config:
                pair_errors = self._validate_pairs(config['pairs'])
                errors.extend(pair_errors)

            # Validate timeframes
            if 'timeframes' in config:
                timeframe_errors = self._validate_timeframes(config['timeframes'])
                errors.extend(timeframe_errors)

            # Validate parameters
            if 'parameters' in config:
                param_errors = self._validate_parameters(config['parameters'])
                errors.extend(param_errors)

            # Validate risk profile
            if 'riskProfile' in config:
                risk_errors = self._validate_risk_profile(config['riskProfile'])
                errors.extend(risk_errors)

        except json.JSONDecodeError as e:
            errors.append(f"Invalid JSON: {str(e)}")
        except FileNotFoundError:
            errors.append(f"Config file not found: {config_path}")
        except Exception as e:
            errors.append(f"Failed to validate config: {str(e)}")

        return ValidationResult(
            is_valid=len(errors) == 0,
            errors=errors,
            warnings=warnings,
            info=info
        )

    def _validate_author(self, author: dict) -> List[str]:
        """Validate author structure"""
        errors = []
        required = {'name', 'email'}

        for field in required:
            if field not in author:
                errors.append(f"Author missing required field: '{field}'")

        # Validate email format
        if 'email' in author:
            if not re.match(r'^[\w\.-]+@[\w\.-]+\.\w+$', author['email']):
                errors.append(f"Invalid email format: {author['email']}")

        return errors

    def _validate_pairs(self, pairs: list) -> List[str]:
        """Validate trading pairs"""
        errors = []

        if not pairs:
            errors.append("At least one trading pair is required")

        for pair in pairs:
            if not isinstance(pair, str):
                errors.append(f"Trading pair should be string, got {type(pair).__name__}")
            elif not re.match(r'^[IB]-[A-Z0-9]+_[A-Z0-9]+$', pair):
                errors.append(
                    f"Invalid pair format: '{pair}' (expected: 'B-BTC_USDT' or 'I-BTC_USDT')"
                )

        return errors

    def _validate_timeframes(self, timeframes: list) -> List[str]:
        """Validate timeframes"""
        errors = []
        valid_timeframes = {'1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w'}

        if not timeframes:
            errors.append("At least one timeframe is required")

        for tf in timeframes:
            if not isinstance(tf, str):
                errors.append(f"Timeframe should be string, got {type(tf).__name__}")
            elif tf not in valid_timeframes:
                errors.append(
                    f"Invalid timeframe: '{tf}' (valid: {', '.join(valid_timeframes)})"
                )

        return errors

    def _validate_parameters(self, parameters: list) -> List[str]:
        """Validate parameters"""
        errors = []

        for i, param in enumerate(parameters):
            if not isinstance(param, dict):
                errors.append(f"Parameter {i} should be object/dict")
                continue

            # Check required fields
            required = {'name', 'type', 'default'}
            missing = required - set(param.keys())
            if missing:
                errors.append(f"Parameter {i} missing fields: {', '.join(missing)}")

            # Validate type
            if 'type' in param:
                valid_types = {'number', 'integer', 'string', 'boolean'}
                if param['type'] not in valid_types:
                    errors.append(
                        f"Parameter '{param.get('name', i)}' has invalid type: {param['type']}"
                    )

        return errors

    def _validate_risk_profile(self, risk: dict) -> List[str]:
        """Validate risk profile"""
        errors = []

        required = {'maxDrawdown', 'volatility', 'leverage'}
        missing = required - set(risk.keys())
        if missing:
            errors.append(f"Risk profile missing fields: {', '.join(missing)}")

        # Validate volatility
        if 'volatility' in risk:
            valid_volatility = {'low', 'medium', 'high'}
            if risk['volatility'] not in valid_volatility:
                errors.append(
                    f"Invalid volatility: '{risk['volatility']}' (valid: {', '.join(valid_volatility)})"
                )

        # Validate numeric fields
        for field in ['maxDrawdown', 'leverage']:
            if field in risk:
                if not isinstance(risk[field], (int, float)):
                    errors.append(f"Risk profile '{field}' should be a number")

        return errors


class StrategyValidator:
    """Main validator that orchestrates all validation checks"""

    def __init__(self):
        self.security_scanner = SecurityScanner()
        self.sdk_checker = SDKComplianceChecker()
        self.config_validator = ConfigValidator()

    def validate_project(self, project_path: Path) -> Dict[str, ValidationResult]:
        """
        Validate entire strategy project

        Args:
            project_path: Path to strategy project directory

        Returns:
            Dictionary with validation results for each component
        """
        results = {}

        # Check if project directory exists
        if not project_path.exists():
            return {
                'error': ValidationResult(
                    is_valid=False,
                    errors=[f"Project directory not found: {project_path}"],
                    warnings=[],
                    info=[]
                )
            }

        # Validate strategy.py
        strategy_file = project_path / 'strategy.py'
        if strategy_file.exists():
            with open(strategy_file, 'r') as f:
                code = f.read()

            results['security'] = self.security_scanner.scan(code)
            results['sdk_compliance'] = self.sdk_checker.check(code)
        else:
            results['error'] = ValidationResult(
                is_valid=False,
                errors=['strategy.py not found'],
                warnings=[],
                info=[]
            )
            return results

        # Validate config.json
        config_file = project_path / 'config.json'
        if config_file.exists():
            results['config'] = self.config_validator.validate(config_file)
        else:
            results['config'] = ValidationResult(
                is_valid=False,
                errors=['config.json not found'],
                warnings=[],
                info=[]
            )

        # Check for requirements.txt
        requirements_file = project_path / 'requirements.txt'
        if not requirements_file.exists():
            results['requirements'] = ValidationResult(
                is_valid=False,
                errors=['requirements.txt not found'],
                warnings=[],
                info=[]
            )
        else:
            results['requirements'] = ValidationResult(
                is_valid=True,
                errors=[],
                warnings=[],
                info=['✓ requirements.txt found']
            )

        return results

    def is_valid(self, results: Dict[str, ValidationResult]) -> bool:
        """Check if all validation results are valid"""
        return all(result.is_valid for result in results.values())
