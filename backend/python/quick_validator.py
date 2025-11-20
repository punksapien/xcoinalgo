#!/usr/bin/env python3
"""
Quick Strategy Code Validator
Performs fast syntax and static analysis without executing code
"""

import ast
import sys
import json
import re
from typing import Dict, List, Any
from dataclasses import dataclass, asdict


@dataclass
class ValidationIssue:
    """Represents a validation issue found in code"""
    severity: str  # 'error', 'warning', 'info'
    message: str
    line: int = 0
    column: int = 0
    code: str = ""  # Error code for categorization


@dataclass
class ValidationResult:
    """Result of code validation"""
    valid: bool
    syntax_errors: List[Dict[str, Any]]
    warnings: List[Dict[str, Any]]
    dangerous_imports: List[Dict[str, Any]]
    info: List[Dict[str, Any]]
    code_stats: Dict[str, Any]


class QuickValidator:
    """Fast validator for Python strategy code"""

    # Dangerous modules that could be misused
    DANGEROUS_IMPORTS = {
        'os': 'File system and process access',
        'subprocess': 'Command execution',
        'socket': 'Network access',
        'urllib': 'Network access',
        'requests': 'Network access (use provided CoinDCXClient instead)',
        'http': 'Network access',
        'ftplib': 'Network access',
        'telnetlib': 'Network access',
        'pickle': 'Arbitrary code execution risk',
        'marshal': 'Arbitrary code execution risk',
        'shelve': 'Arbitrary code execution risk',
        'eval': 'Code injection risk',
        'exec': 'Code injection risk',
        'compile': 'Code compilation',
        'importlib': 'Dynamic imports',
        '__import__': 'Dynamic imports',
        'sys': 'System access',
        'ctypes': 'Low-level memory access',
        'multiprocessing': 'Process creation',
        'threading': 'Thread management (use carefully)',
    }

    # Allowed safe modules (whitelist approach)
    SAFE_IMPORTS = {
        'pandas', 'numpy', 'ta', 'datetime', 'time', 'json',
        'decimal', 'math', 'statistics', 'collections',
        'itertools', 'functools', 'operator', 'typing',
        'dataclasses', 'enum', 'abc', 'copy', 'pprint',
        'logging'  # Allowed for strategy logging
    }

    # Dangerous function calls
    DANGEROUS_CALLS = {
        'eval', 'exec', 'compile', '__import__',
        'open',  # File I/O should be restricted
        'input',  # User input in strategy doesn't make sense
    }

    def __init__(self, code: str):
        self.code = code
        self.issues: List[ValidationIssue] = []
        self.tree = None
        self.code_stats = {
            'lines': 0,
            'classes': 0,
            'functions': 0,
            'imports': 0,
            'complexity_score': 0
        }

    def validate(self) -> ValidationResult:
        """Run all validation checks"""
        # 1. Check syntax
        syntax_valid = self._check_syntax()

        if syntax_valid:
            # 2. Parse AST if syntax is valid
            try:
                self.tree = ast.parse(self.code)
                self._collect_stats()
                self._check_dangerous_imports()
                self._check_dangerous_calls()
                self._check_anti_patterns()
                self._check_required_structure()
            except Exception as e:
                self.issues.append(ValidationIssue(
                    severity='error',
                    message=f'AST parsing failed: {str(e)}',
                    code='AST_ERROR'
                ))

        # Categorize issues
        syntax_errors = [asdict(i) for i in self.issues if i.severity == 'error']
        warnings = [asdict(i) for i in self.issues if i.severity == 'warning']
        dangerous = [asdict(i) for i in self.issues if 'DANGEROUS' in i.code]
        info = [asdict(i) for i in self.issues if i.severity == 'info']

        return ValidationResult(
            valid=len(syntax_errors) == 0,
            syntax_errors=syntax_errors,
            warnings=warnings,
            dangerous_imports=dangerous,
            info=info,
            code_stats=self.code_stats
        )

    def _check_syntax(self) -> bool:
        """Check basic Python syntax"""
        try:
            compile(self.code, '<string>', 'exec')
            self.code_stats['lines'] = len(self.code.splitlines())
            return True
        except SyntaxError as e:
            self.issues.append(ValidationIssue(
                severity='error',
                message=f'Syntax Error: {e.msg}',
                line=e.lineno or 0,
                column=e.offset or 0,
                code='SYNTAX_ERROR'
            ))
            return False
        except IndentationError as e:
            self.issues.append(ValidationIssue(
                severity='error',
                message=f'Indentation Error: {e.msg}',
                line=e.lineno or 0,
                column=e.offset or 0,
                code='INDENTATION_ERROR'
            ))
            return False
        except Exception as e:
            self.issues.append(ValidationIssue(
                severity='error',
                message=f'Compilation Error: {str(e)}',
                code='COMPILE_ERROR'
            ))
            return False

    def _collect_stats(self):
        """Collect code statistics"""
        if not self.tree:
            return

        for node in ast.walk(self.tree):
            if isinstance(node, ast.ClassDef):
                self.code_stats['classes'] += 1
            elif isinstance(node, ast.FunctionDef):
                self.code_stats['functions'] += 1
            elif isinstance(node, (ast.Import, ast.ImportFrom)):
                self.code_stats['imports'] += 1

    def _check_dangerous_imports(self):
        """Check for potentially dangerous imports"""
        if not self.tree:
            return

        for node in ast.walk(self.tree):
            if isinstance(node, ast.Import):
                for alias in node.names:
                    self._check_import_name(alias.name, node.lineno)

            elif isinstance(node, ast.ImportFrom):
                module = node.module or ''
                for alias in node.names:
                    full_name = f"{module}.{alias.name}" if module else alias.name
                    self._check_import_name(module, node.lineno)
                    self._check_import_name(full_name, node.lineno)

    def _check_import_name(self, name: str, line: int):
        """Check if an import name is dangerous"""
        # Check base module name
        base_module = name.split('.')[0]

        if base_module in self.DANGEROUS_IMPORTS:
            reason = self.DANGEROUS_IMPORTS[base_module]
            self.issues.append(ValidationIssue(
                severity='error',
                message=f"Dangerous import '{name}': {reason}",
                line=line,
                code='DANGEROUS_IMPORT'
            ))
        elif base_module not in self.SAFE_IMPORTS:
            # Unknown module - warn but don't block
            self.issues.append(ValidationIssue(
                severity='warning',
                message=f"Unrecognized module '{name}' - ensure it's in requirements.txt",
                line=line,
                code='UNKNOWN_IMPORT'
            ))

    def _check_dangerous_calls(self):
        """Check for dangerous function calls"""
        if not self.tree:
            return

        for node in ast.walk(self.tree):
            if isinstance(node, ast.Call):
                func_name = self._get_call_name(node.func)
                if func_name in self.DANGEROUS_CALLS:
                    self.issues.append(ValidationIssue(
                        severity='error',
                        message=f"Dangerous function call: {func_name}()",
                        line=node.lineno,
                        code='DANGEROUS_CALL'
                    ))

    def _get_call_name(self, node) -> str:
        """Extract function name from call node"""
        if isinstance(node, ast.Name):
            return node.id
        elif isinstance(node, ast.Attribute):
            return node.attr
        return ''

    def _check_anti_patterns(self):
        """Check for common anti-patterns"""
        if not self.tree:
            return

        # Check for bare except clauses
        for node in ast.walk(self.tree):
            if isinstance(node, ast.ExceptHandler):
                if node.type is None:
                    self.issues.append(ValidationIssue(
                        severity='warning',
                        message='Bare except clause - specify exception types',
                        line=node.lineno,
                        code='BARE_EXCEPT'
                    ))

            # Check for infinite loops (basic heuristic)
            elif isinstance(node, ast.While):
                if isinstance(node.test, ast.Constant) and node.test.value is True:
                    has_break = any(isinstance(n, ast.Break) for n in ast.walk(node))
                    if not has_break:
                        self.issues.append(ValidationIssue(
                            severity='warning',
                            message='Potential infinite loop detected (while True without break)',
                            line=node.lineno,
                            code='INFINITE_LOOP'
                        ))

    def _check_required_structure(self):
        """Check for required strategy structure"""
        if not self.tree:
            return

        required_classes = ['CoinDCXClient', 'Trader', 'LiveTrader', 'Backtester', 'CsvHandler']
        found_classes = []

        for node in ast.walk(self.tree):
            if isinstance(node, ast.ClassDef):
                found_classes.append(node.name)

        missing_classes = [cls for cls in required_classes if cls not in found_classes]

        if missing_classes:
            self.issues.append(ValidationIssue(
                severity='info',
                message=f"Missing recommended classes: {', '.join(missing_classes)}",
                code='MISSING_STRUCTURE'
            ))

        # Check if has at least one class
        if not found_classes:
            self.issues.append(ValidationIssue(
                severity='warning',
                message='No classes defined - strategies should define required classes',
                code='NO_CLASSES'
            ))


def main():
    """Main entry point for CLI usage"""
    if len(sys.argv) > 1:
        # Read from file
        with open(sys.argv[1], 'r') as f:
            code = f.read()
    else:
        # Read from stdin
        code = sys.stdin.read()

    validator = QuickValidator(code)
    result = validator.validate()

    # Output JSON
    output = {
        'valid': result.valid,
        'syntaxErrors': result.syntax_errors,
        'warnings': result.warnings,
        'dangerousImports': result.dangerous_imports,
        'info': result.info,
        'codeStats': result.code_stats
    }

    print(json.dumps(output, indent=2))

    # Exit with appropriate code
    sys.exit(0 if result.valid else 1)


if __name__ == '__main__':
    main()
