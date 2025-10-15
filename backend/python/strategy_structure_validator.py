"""
Strategy Structure Validator
Validates that uploaded Python strategy files contain all required classes and methods.
This validator checks the structural integrity of strategy files without caring about logic.
"""

import ast
import json
from typing import Dict, List, Any, Optional, Set
from dataclasses import dataclass, field


@dataclass
class MethodSignature:
    """Represents a required method signature"""
    name: str
    params: List[str] = field(default_factory=list)
    required: bool = True
    return_type: Optional[str] = None


@dataclass
class ClassDefinition:
    """Represents a required class definition"""
    name: str
    methods: List[MethodSignature] = field(default_factory=list)
    base_classes: List[str] = field(default_factory=list)
    required: bool = True


@dataclass
class ValidationError:
    """Represents a validation error"""
    class_name: Optional[str]
    method_name: Optional[str]
    error_type: str
    message: str


@dataclass
class ValidationResult:
    """Result of validation"""
    is_valid: bool
    errors: List[ValidationError] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)
    found_classes: List[str] = field(default_factory=list)
    found_methods: Dict[str, List[str]] = field(default_factory=dict)


# Define the required structure for strategy files
REQUIRED_STRUCTURE = {
    "CoinDCXClient": ClassDefinition(
        name="CoinDCXClient",
        methods=[
            MethodSignature("__init__", ["self", "key", "secret"]),
            MethodSignature("_sign", ["self", "data"]),
            MethodSignature("_make_public_request", ["self", "method", "endpoint", "params"]),
            MethodSignature("_make_request", ["self", "method", "endpoint", "payload"]),
            MethodSignature("get_active_instruments", ["self", "margin_currency_short_name"]),
            MethodSignature("get_instrument_details", ["self", "pair", "margin_currency_short_name"]),
            MethodSignature("get_instrument_trade_history", ["self", "pair"]),
            MethodSignature("get_instrument_orderbook", ["self", "pair", "depth"]),
            MethodSignature("get_instrument_candlesticks", ["self", "pair", "from_ts", "to_ts", "resolution"]),
            MethodSignature("get_cross_margin_details", ["self"]),
            MethodSignature("wallet_transfer", ["self", "transfer_type", "amount", "currency_short_name"]),
            MethodSignature("get_wallet_details", ["self"]),
            MethodSignature("get_wallet_transactions", ["self", "page", "size"]),
            MethodSignature("get_currency_conversion", ["self"]),
            MethodSignature("get_transactions", ["self", "stage", "page", "size", "margin_currency_short_name"]),
            MethodSignature("get_trades", ["self", "from_date", "to_date", "page", "size", "pair", "order_id", "margin_currency_short_name"]),
            MethodSignature("get_pair_stats", ["self", "pair"]),
            MethodSignature("get_rt_prices", ["self"]),
            MethodSignature("get_rt_prices_for_pair", ["self", "pair"]),
            MethodSignature("_validate_order_params", ["self", "pair", "quantity", "price", "margin_currency"]),
            MethodSignature("list_orders", ["self", "status", "side", "page", "size", "margin_currency_short_name"]),
            MethodSignature("create_order", ["self", "pair", "side", "order_type", "total_quantity", "leverage"]),
            MethodSignature("cancel_order", ["self", "order_id"]),
            MethodSignature("edit_order", ["self", "order_id", "total_quantity", "price"]),
            MethodSignature("list_positions", ["self", "page", "size", "margin_currency_short_name"]),
            MethodSignature("get_positions_by_filter", ["self", "pairs", "position_ids"]),
            MethodSignature("update_position_leverage", ["self", "leverage", "pair", "position_id"]),
            MethodSignature("add_margin", ["self", "position_id", "amount"]),
            MethodSignature("remove_margin", ["self", "position_id", "amount"]),
            MethodSignature("cancel_all_open_orders", ["self", "margin_currency_short_name"]),
            MethodSignature("cancel_all_open_orders_for_position", ["self", "position_id"]),
            MethodSignature("exit_position", ["self", "position_id"]),
            MethodSignature("create_tpsl_orders", ["self", "position_id", "take_profit", "stop_loss"]),
            MethodSignature("change_position_margin_type", ["self", "pair", "margin_type"]),
        ]
    ),
    "Trader": ClassDefinition(
        name="Trader",
        methods=[
            MethodSignature("generate_signals", ["self", "df", "params"]),
        ]
    ),
    "CsvHandler": ClassDefinition(
        name="CsvHandler",
        base_classes=["logging.FileHandler"],
        methods=[
            MethodSignature("__init__", ["self", "filename", "mode", "encoding", "delay"]),
            MethodSignature("_write_header", ["self"]),
            MethodSignature("emit", ["self", "record"]),
            MethodSignature("setup_logging", []),  # Static method
        ]
    ),
    "LiveTrader": ClassDefinition(
        name="LiveTrader",
        base_classes=["Trader"],
        methods=[
            MethodSignature("__init__", ["self", "settings"]),  # Only settings, not subscribers
            MethodSignature("get_latest_data", ["self"]),
            MethodSignature("check_for_new_signal", ["self", "df"]),
            MethodSignature("check_and_manage_position", ["self", "df"]),
            MethodSignature("run", ["self"]),
        ]
    ),
    "Backtester": ClassDefinition(
        name="Backtester",
        base_classes=["Trader"],
        methods=[
            MethodSignature("__init__", ["self", "settings"]),
            # Note: These are static methods (no self parameter)
            MethodSignature("fetch_coindcx_data", ["pair", "start_date", "end_date", "resolution"]),
            MethodSignature("compute_position_size", ["capital", "entry_price", "leverage", "risk_per_trade"]),
            MethodSignature("execute_trades", ["df", "initial_capital", "leverage", "commission_rate", "gst_rate", "sl_rate", "tp_rate"]),
            MethodSignature("evaluate_backtest_metrics", ["trades_df", "initial_capital"]),
        ]
    ),
}


class StrategyStructureValidator:
    """Validates the structure of strategy Python files"""

    def __init__(self, required_structure: Dict[str, ClassDefinition] = None):
        self.required_structure = required_structure or REQUIRED_STRUCTURE
        self.tree = None
        self.found_classes = {}

    def validate(self, code: str) -> ValidationResult:
        """
        Validate the structure of a Python strategy file

        Args:
            code: Python source code as string

        Returns:
            ValidationResult with validation status and details
        """
        errors = []
        warnings = []

        # Step 1: Parse the code
        try:
            self.tree = ast.parse(code)
        except SyntaxError as e:
            return ValidationResult(
                is_valid=False,
                errors=[ValidationError(
                    class_name=None,
                    method_name=None,
                    error_type="SYNTAX_ERROR",
                    message=f"Syntax error at line {e.lineno}: {e.msg}"
                )]
            )
        except Exception as e:
            return ValidationResult(
                is_valid=False,
                errors=[ValidationError(
                    class_name=None,
                    method_name=None,
                    error_type="PARSE_ERROR",
                    message=f"Failed to parse code: {str(e)}"
                )]
            )

        # Step 2: Extract all classes and their methods
        self._extract_classes()

        # Step 3: Validate required classes exist
        for class_name, class_def in self.required_structure.items():
            if class_name not in self.found_classes:
                errors.append(ValidationError(
                    class_name=class_name,
                    method_name=None,
                    error_type="MISSING_CLASS",
                    message=f"Required class '{class_name}' not found"
                ))
                continue

            # Step 4: Validate inheritance
            found_class = self.found_classes[class_name]
            if class_def.base_classes:
                inheritance_errors = self._validate_inheritance(
                    class_name,
                    found_class,
                    class_def.base_classes
                )
                errors.extend(inheritance_errors)

            # Step 5: Validate required methods exist
            method_errors = self._validate_methods(class_name, found_class, class_def.methods)
            errors.extend(method_errors)

        # Collect found information for reporting
        found_classes = list(self.found_classes.keys())
        found_methods = {
            cls_name: [m['name'] for m in cls_info['methods']]
            for cls_name, cls_info in self.found_classes.items()
        }

        return ValidationResult(
            is_valid=len(errors) == 0,
            errors=errors,
            warnings=warnings,
            found_classes=found_classes,
            found_methods=found_methods
        )

    def _extract_classes(self):
        """Extract all class definitions from the AST"""
        for node in ast.walk(self.tree):
            if isinstance(node, ast.ClassDef):
                methods = []
                for item in node.body:
                    if isinstance(item, ast.FunctionDef):
                        # Extract parameter names
                        params = [arg.arg for arg in item.args.args]
                        methods.append({
                            'name': item.name,
                            'params': params,
                            'is_static': any(
                                isinstance(dec, ast.Name) and dec.id == 'staticmethod'
                                for dec in item.decorator_list
                            )
                        })

                # Extract base classes
                base_classes = []
                for base in node.bases:
                    if isinstance(base, ast.Name):
                        base_classes.append(base.id)
                    elif isinstance(base, ast.Attribute):
                        # Handle cases like logging.FileHandler
                        base_classes.append(self._get_full_name(base))

                self.found_classes[node.name] = {
                    'name': node.name,
                    'methods': methods,
                    'base_classes': base_classes
                }

    def _get_full_name(self, node: ast.Attribute) -> str:
        """Get the full name of an attribute node (e.g., logging.FileHandler)"""
        if isinstance(node.value, ast.Name):
            return f"{node.value.id}.{node.attr}"
        elif isinstance(node.value, ast.Attribute):
            return f"{self._get_full_name(node.value)}.{node.attr}"
        return node.attr

    def _validate_inheritance(
        self,
        class_name: str,
        found_class: Dict,
        required_bases: List[str]
    ) -> List[ValidationError]:
        """Validate that a class inherits from required base classes"""
        errors = []
        found_bases = found_class['base_classes']

        for required_base in required_bases:
            # Check if any found base matches the required base
            # Support both "Trader" and module-qualified names like "logging.FileHandler"
            base_found = any(
                required_base in base or base in required_base
                for base in found_bases
            )

            if not base_found:
                errors.append(ValidationError(
                    class_name=class_name,
                    method_name=None,
                    error_type="MISSING_INHERITANCE",
                    message=f"Class '{class_name}' must inherit from '{required_base}'"
                ))

        return errors

    def _validate_methods(
        self,
        class_name: str,
        found_class: Dict,
        required_methods: List[MethodSignature]
    ) -> List[ValidationError]:
        """Validate that a class has all required methods with correct signatures"""
        errors = []
        found_methods = {m['name']: m for m in found_class['methods']}

        for required_method in required_methods:
            if required_method.name not in found_methods:
                errors.append(ValidationError(
                    class_name=class_name,
                    method_name=required_method.name,
                    error_type="MISSING_METHOD",
                    message=f"Class '{class_name}' is missing required method '{required_method.name}'"
                ))
                continue

            # Validate method signature (parameters)
            found_method = found_methods[required_method.name]
            signature_errors = self._validate_signature(
                class_name,
                required_method,
                found_method
            )
            errors.extend(signature_errors)

        return errors

    def _validate_signature(
        self,
        class_name: str,
        required_method: MethodSignature,
        found_method: Dict
    ) -> List[ValidationError]:
        """
        Validate method signature (parameter count and names)

        Strategy:
        - MUST have AT LEAST the required parameters (can have MORE)
        - CANNOT have FEWER parameters than required
        - Allows additional optional params, defaults, *args, **kwargs
        - Checks that required param names exist in order (first N params)
        - Accepts both static methods and instance methods (flexible about 'self')
        """
        errors = []

        required_params = required_method.params
        found_params = found_method['params']

        # Handle 'self' parameter flexibly:
        # - If required signature has NO 'self', accept both static and instance methods
        # - If found method has 'self' but required doesn't, skip 'self' in found params
        # - If found method is @staticmethod and required has 'self', skip 'self' in required
        has_self_in_required = 'self' in required_params
        has_self_in_found = len(found_params) > 0 and found_params[0] == 'self'

        # Case 1: Found method is static but required expects instance method
        if found_method.get('is_static') and has_self_in_required:
            required_params = [p for p in required_params if p != 'self']

        # Case 2: Found method is instance method but required signature doesn't include 'self'
        # (This means the required signature is flexible - accepts both static and instance)
        elif has_self_in_found and not has_self_in_required:
            found_params = found_params[1:]  # Skip 'self' from found params

        # Count actual parameters (excluding *args, **kwargs which are always allowed)
        found_positional = [p for p in found_params if p not in ('args', 'kwargs')]
        min_required = len(required_params)

        # Rule 1: Must have AT LEAST the required number of parameters
        # (can have MORE for optional params, defaults, etc.)
        if len(found_positional) < min_required:
            errors.append(ValidationError(
                class_name=class_name,
                method_name=required_method.name,
                error_type="SIGNATURE_MISMATCH",
                message=f"Method '{class_name}.{required_method.name}' has {len(found_positional)} parameters, "
                       f"but requires at least {min_required}. "
                       f"Found: ({', '.join(found_params)}), "
                       f"Required: ({', '.join(required_params)}). "
                       f"You can have MORE parameters (optional, defaults, *args, **kwargs) but not FEWER."
            ))
            return errors

        # Rule 2: Check that the first N required parameters match by name and position
        # This ensures the required params are in the correct order
        for i, required_param in enumerate(required_params):
            if i >= len(found_positional):
                break  # Already checked count above

            found_param = found_positional[i]
            if found_param != required_param:
                errors.append(ValidationError(
                    class_name=class_name,
                    method_name=required_method.name,
                    error_type="SIGNATURE_MISMATCH",
                    message=f"Method '{class_name}.{required_method.name}' parameter at position {i+1}: "
                           f"expected '{required_param}', found '{found_param}'. "
                           f"Required signature: ({', '.join(required_params)})"
                ))

        return errors


def validate_strategy_structure(code: str) -> Dict[str, Any]:
    """
    Validate strategy structure and return JSON-serializable result

    Args:
        code: Python source code as string

    Returns:
        Dictionary with validation results
    """
    validator = StrategyStructureValidator()
    result = validator.validate(code)

    return {
        "is_valid": result.is_valid,
        "errors": [
            {
                "class_name": err.class_name,
                "method_name": err.method_name,
                "error_type": err.error_type,
                "message": err.message
            }
            for err in result.errors
        ],
        "warnings": result.warnings,
        "found_classes": result.found_classes,
        "found_methods": result.found_methods,
        "summary": {
            "total_errors": len(result.errors),
            "total_warnings": len(result.warnings),
            "classes_found": len(result.found_classes),
            "classes_expected": len(REQUIRED_STRUCTURE)
        }
    }


if __name__ == "__main__":
    # CLI mode: read from stdin, output JSON to stdout
    import sys

    # Read code from stdin
    code = sys.stdin.read()

    # Validate
    result = validate_strategy_structure(code)

    # Output JSON result
    print(json.dumps(result, indent=2))
