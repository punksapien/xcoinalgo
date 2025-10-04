#!/usr/bin/env python3
"""
Strategy validation script for CoinDCX SDK
This script validates strategy code for compliance with SDK requirements
"""

import ast
import sys
import json
import os
import importlib.util
import traceback
from typing import List, Dict, Any, Optional
from pathlib import Path

class StrategyValidator:
    def __init__(self):
        self.errors = []
        self.warnings = []

    def validate_strategy_file(self, strategy_path: str) -> Dict[str, Any]:
        """Validate a strategy Python file"""
        try:
            # Check if file exists
            if not os.path.exists(strategy_path):
                self.errors.append(f"Strategy file not found: {strategy_path}")
                return self._create_result()

            # Read and parse the file
            with open(strategy_path, 'r', encoding='utf-8') as f:
                content = f.read()

            # Basic syntax check
            try:
                tree = ast.parse(content)
            except SyntaxError as e:
                self.errors.append(f"Syntax error in strategy file: {e}")
                return self._create_result()

            # Check for required imports and class structure
            self._validate_imports(tree)
            self._validate_class_structure(tree)
            self._validate_required_methods(tree)

            # Try to import the module for runtime validation
            if not self.errors:
                self._validate_runtime_requirements(strategy_path)

            return self._create_result()

        except Exception as e:
            self.errors.append(f"Unexpected error during validation: {str(e)}")
            return self._create_result()

    def validate_config_file(self, config_path: Optional[str]) -> None:
        """Validate strategy configuration file"""
        if not config_path or not os.path.exists(config_path):
            self.warnings.append("No configuration file found. Using default config.")
            return

        try:
            if config_path.endswith('.json'):
                with open(config_path, 'r') as f:
                    config = json.load(f)
            elif config_path.endswith(('.yaml', '.yml')):
                import yaml
                with open(config_path, 'r') as f:
                    config = yaml.safe_load(f)
            else:
                self.errors.append("Configuration file must be JSON or YAML format")
                return

            # Validate required config fields
            required_fields = ['name', 'code', 'author', 'pair']
            for field in required_fields:
                if field not in config:
                    self.errors.append(f"Missing required configuration field: {field}")

            # Validate config values
            if 'leverage' in config and (config['leverage'] < 1 or config['leverage'] > 100):
                self.warnings.append("Leverage should be between 1 and 100")

            if 'risk_per_trade' in config and (config['risk_per_trade'] < 0.001 or config['risk_per_trade'] > 0.1):
                self.warnings.append("Risk per trade should be between 0.1% and 10%")

        except Exception as e:
            self.errors.append(f"Error validating configuration: {str(e)}")

    def validate_requirements_file(self, requirements_path: Optional[str]) -> None:
        """Validate requirements.txt file"""
        if not requirements_path or not os.path.exists(requirements_path):
            self.warnings.append("No requirements.txt found. Assuming standard dependencies.")
            return

        try:
            with open(requirements_path, 'r') as f:
                requirements = f.read().strip().split('\n')

            # Check for required dependencies
            required_deps = ['pandas', 'numpy']
            found_deps = [req.split('>=')[0].split('==')[0].split('<')[0].strip()
                         for req in requirements if req.strip()]

            for dep in required_deps:
                if dep not in found_deps:
                    self.errors.append(f"Missing required dependency: {dep}")

            # Check for potentially dangerous packages
            dangerous_deps = ['os', 'subprocess', 'sys', 'eval', 'exec']
            for dep in dangerous_deps:
                if dep in found_deps:
                    self.errors.append(f"Potentially dangerous dependency not allowed: {dep}")

        except Exception as e:
            self.errors.append(f"Error validating requirements: {str(e)}")

    def _validate_imports(self, tree: ast.AST) -> None:
        """Check for required imports"""
        imports = []
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                imports.extend([alias.name for alias in node.names])
            elif isinstance(node, ast.ImportFrom):
                if node.module:
                    imports.append(node.module)

        # Check for SDK import
        sdk_imports = ['coindcx_sdk', 'coindcx_sdk.BaseStrategy', 'BaseStrategy']
        if not any(imp in ' '.join(imports) for imp in sdk_imports):
            self.errors.append("Strategy must import BaseStrategy from coindcx_sdk")

    def _validate_class_structure(self, tree: ast.AST) -> None:
        """Validate class structure"""
        strategy_classes = []

        for node in ast.walk(tree):
            if isinstance(node, ast.ClassDef):
                # Check if class inherits from BaseStrategy
                if node.bases:
                    for base in node.bases:
                        if isinstance(base, ast.Name) and base.id == 'BaseStrategy':
                            strategy_classes.append(node.name)
                        elif isinstance(base, ast.Attribute) and base.attr == 'BaseStrategy':
                            strategy_classes.append(node.name)

        if not strategy_classes:
            self.errors.append("No class found that inherits from BaseStrategy")
        elif len(strategy_classes) > 1:
            self.warnings.append(f"Multiple strategy classes found: {', '.join(strategy_classes)}")

    def _validate_required_methods(self, tree: ast.AST) -> None:
        """Check for required methods"""
        required_methods = ['initialize', 'generate_signals']

        for node in ast.walk(tree):
            if isinstance(node, ast.ClassDef):
                # Check if this class has BaseStrategy as base
                inherits_base_strategy = any(
                    (isinstance(base, ast.Name) and base.id == 'BaseStrategy') or
                    (isinstance(base, ast.Attribute) and base.attr == 'BaseStrategy')
                    for base in node.bases
                )

                if inherits_base_strategy:
                    method_names = [n.name for n in node.body if isinstance(n, ast.FunctionDef)]

                    for method in required_methods:
                        if method not in method_names:
                            self.errors.append(f"Missing required method: {method}")

    def _validate_runtime_requirements(self, strategy_path: str) -> None:
        """Runtime validation by attempting to import the strategy"""
        try:
            # Get the directory and module name
            strategy_dir = os.path.dirname(os.path.abspath(strategy_path))
            module_name = os.path.basename(strategy_path).replace('.py', '')

            # Add to Python path temporarily
            sys.path.insert(0, strategy_dir)

            try:
                # Import the module
                spec = importlib.util.spec_from_file_location(module_name, strategy_path)
                if spec is None or spec.loader is None:
                    self.errors.append("Could not create module spec from strategy file")
                    return

                module = importlib.util.module_from_spec(spec)
                spec.loader.exec_module(module)

                # Find strategy classes
                strategy_classes = []
                for name in dir(module):
                    obj = getattr(module, name)
                    if (isinstance(obj, type) and
                        hasattr(obj, '__bases__') and
                        any('BaseStrategy' in str(base) for base in obj.__bases__)):
                        strategy_classes.append(obj)

                if not strategy_classes:
                    self.errors.append("No valid strategy class found that inherits from BaseStrategy")
                else:
                    # Try to instantiate with dummy config
                    for strategy_class in strategy_classes:
                        try:
                            # This is a basic check - in real validation we'd use proper config
                            if hasattr(strategy_class, '__init__'):
                                self.warnings.append(f"Strategy class {strategy_class.__name__} found and appears valid")
                        except Exception as e:
                            self.errors.append(f"Error instantiating strategy class {strategy_class.__name__}: {str(e)}")

            finally:
                # Remove from Python path
                if strategy_dir in sys.path:
                    sys.path.remove(strategy_dir)

        except Exception as e:
            self.errors.append(f"Runtime validation error: {str(e)}")

    def _create_result(self) -> Dict[str, Any]:
        """Create validation result"""
        return {
            'is_valid': len(self.errors) == 0,
            'errors': self.errors,
            'warnings': self.warnings
        }

def main():
    """Command line interface for validation"""
    if len(sys.argv) < 2:
        print("Usage: python validation.py <strategy_directory>")
        sys.exit(1)

    strategy_dir = sys.argv[1]

    # Find strategy files
    strategy_file = None
    config_file = None
    requirements_file = None

    for file_name in ['strategy.py', 'main.py', 'bot.py']:
        path = os.path.join(strategy_dir, file_name)
        if os.path.exists(path):
            strategy_file = path
            break

    for file_name in ['config.yaml', 'config.yml', 'config.json']:
        path = os.path.join(strategy_dir, file_name)
        if os.path.exists(path):
            config_file = path
            break

    requirements_path = os.path.join(strategy_dir, 'requirements.txt')
    if os.path.exists(requirements_path):
        requirements_file = requirements_path

    # Validate
    validator = StrategyValidator()

    if strategy_file:
        result = validator.validate_strategy_file(strategy_file)
        validator.validate_config_file(config_file)
        validator.validate_requirements_file(requirements_file)
    else:
        result = {
            'is_valid': False,
            'errors': ['No strategy file found (looking for strategy.py, main.py, or bot.py)'],
            'warnings': []
        }

    # Output result as JSON
    final_result = {
        'is_valid': len(validator.errors) == 0,
        'errors': validator.errors,
        'warnings': validator.warnings
    }

    print(json.dumps(final_result, indent=2))

    # Exit with appropriate code
    sys.exit(0 if final_result['is_valid'] else 1)

if __name__ == '__main__':
    main()