#!/usr/bin/env python3
"""
Sandbox Executor - Safely test strategy code in isolated environment
Runs inside Docker container with resource limits
"""

import sys
import json
import traceback
import importlib.util
import time
from typing import Dict, Any, List


class SandboxExecutor:
    """Execute strategy code in sandbox for validation"""

    def __init__(self, strategy_path: str = '/workspace/strategy.py'):
        self.strategy_path = strategy_path
        self.results = {
            'success': False,
            'errors': [],
            'warnings': [],
            'info': [],
            'classes_found': [],
            'methods_found': {},
            'execution_time_ms': 0
        }

    def execute(self) -> Dict[str, Any]:
        """Main execution entry point"""
        start_time = time.time()

        try:
            # Step 1: Load the module
            module = self._load_module()
            if not module:
                return self.results

            # Step 2: Validate required classes exist
            required_classes = ['CoinDCXClient', 'Trader', 'LiveTrader', 'Backtester', 'CsvHandler']
            self._validate_classes(module, required_classes)

            # Step 3: Test instantiation (if possible)
            self._test_instantiation(module)

            # Step 4: Check for common issues
            self._check_common_issues(module)

            # Mark as successful if no errors
            if not self.results['errors']:
                self.results['success'] = True
                self.results['info'].append({
                    'message': 'Strategy code loaded and validated successfully'
                })

        except Exception as e:
            self.results['errors'].append({
                'severity': 'error',
                'message': f'Unexpected error: {str(e)}',
                'traceback': traceback.format_exc()
            })

        finally:
            execution_time = (time.time() - start_time) * 1000
            self.results['execution_time_ms'] = round(execution_time, 2)

        return self.results

    def _load_module(self):
        """Load the strategy module"""
        try:
            spec = importlib.util.spec_from_file_location('strategy', self.strategy_path)
            if not spec or not spec.loader:
                self.results['errors'].append({
                    'severity': 'error',
                    'message': 'Failed to load strategy module spec'
                })
                return None

            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)

            self.results['info'].append({
                'message': 'Module loaded successfully'
            })

            return module

        except FileNotFoundError:
            self.results['errors'].append({
                'severity': 'error',
                'message': f'Strategy file not found: {self.strategy_path}'
            })
            return None

        except SyntaxError as e:
            self.results['errors'].append({
                'severity': 'error',
                'message': f'Syntax error: {e.msg}',
                'line': e.lineno,
                'column': e.offset
            })
            return None

        except ImportError as e:
            self.results['errors'].append({
                'severity': 'error',
                'message': f'Import error: {str(e)}',
                'suggestion': 'Check if all required packages are in requirements.txt'
            })
            return None

        except Exception as e:
            self.results['errors'].append({
                'severity': 'error',
                'message': f'Failed to load module: {str(e)}',
                'traceback': traceback.format_exc()
            })
            return None

    def _validate_classes(self, module, required_classes: List[str]):
        """Validate that required classes exist"""
        for class_name in required_classes:
            if hasattr(module, class_name):
                cls = getattr(module, class_name)
                self.results['classes_found'].append(class_name)

                # Get methods
                methods = [m for m in dir(cls) if not m.startswith('_')]
                self.results['methods_found'][class_name] = methods

                self.results['info'].append({
                    'message': f'Found class: {class_name} with {len(methods)} methods'
                })
            else:
                self.results['warnings'].append({
                    'severity': 'warning',
                    'message': f'Missing required class: {class_name}'
                })

    def _test_instantiation(self, module):
        """Test if classes can be instantiated (basic check)"""
        # We can't actually instantiate because we don't have credentials, API keys, etc.
        # But we can check if __init__ methods have reasonable signatures

        test_classes = ['Backtester', 'Trader']

        for class_name in test_classes:
            if not hasattr(module, class_name):
                continue

            cls = getattr(module, class_name)

            # Check if __init__ exists and is callable
            if hasattr(cls, '__init__'):
                import inspect
                sig = inspect.signature(cls.__init__)
                params = list(sig.parameters.keys())

                # Remove 'self' from params
                if 'self' in params:
                    params.remove('self')

                self.results['info'].append({
                    'message': f'{class_name}.__init__ parameters: {", ".join(params)}'
                })

    def _check_common_issues(self, module):
        """Check for common issues in the code"""
        import inspect

        # Check for infinite loops (basic heuristic)
        source = inspect.getsource(module)

        # Check for while True without break
        if 'while True:' in source and 'break' not in source:
            self.results['warnings'].append({
                'severity': 'warning',
                'message': 'Potential infinite loop detected (while True without break)'
            })

        # Check for time.sleep in loops (can be problematic)
        if 'time.sleep' in source and ('while' in source or 'for' in source):
            self.results['warnings'].append({
                'severity': 'warning',
                'message': 'time.sleep() detected in loop - may cause slow execution'
            })

        # Check for print statements (should use logging)
        if 'print(' in source:
            self.results['warnings'].append({
                'severity': 'warning',
                'message': 'Found print() statements - consider using logging instead'
            })


def main():
    """Main entry point"""
    try:
        executor = SandboxExecutor()
        results = executor.execute()

        # Output results as JSON
        print(json.dumps(results, indent=2))

        # Exit with appropriate code
        sys.exit(0 if results['success'] else 1)

    except Exception as e:
        error_result = {
            'success': False,
            'errors': [{
                'severity': 'error',
                'message': f'Sandbox executor failed: {str(e)}',
                'traceback': traceback.format_exc()
            }],
            'warnings': [],
            'info': [],
            'classes_found': [],
            'methods_found': {},
            'execution_time_ms': 0
        }

        print(json.dumps(error_result, indent=2))
        sys.exit(1)


if __name__ == '__main__':
    main()
