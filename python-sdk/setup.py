"""
Setup configuration for CoinDCX Strategy SDK
"""

from setuptools import setup, find_packages

with open("README.md", "r", encoding="utf-8") as fh:
    long_description = fh.read()

setup(
    name="coindcx-sdk",
    version="1.0.0",
    author="CoinDCX Quant Team",
    author_email="quant@coindcx.com",
    description="CoinDCX Strategy Development Kit for cryptocurrency trading strategies",
    long_description=long_description,
    long_description_content_type="text/markdown",
    url="https://github.com/coindcx/coindcx-sdk",
    packages=find_packages(),
    classifiers=[
        "Development Status :: 4 - Beta",
        "Intended Audience :: Financial and Insurance Industry",
        "License :: OSI Approved :: MIT License",
        "Operating System :: OS Independent",
        "Programming Language :: Python :: 3",
        "Programming Language :: Python :: 3.8",
        "Programming Language :: Python :: 3.9",
        "Programming Language :: Python :: 3.10",
        "Programming Language :: Python :: 3.11",
        "Topic :: Office/Business :: Financial :: Investment",
        "Topic :: Software Development :: Libraries :: Python Modules",
    ],
    python_requires=">=3.8",
    install_requires=[
        "pandas>=1.3.0",
        "numpy>=1.20.0",
        "requests>=2.25.0",
        "PyYAML>=5.4.0",
        "python-dateutil>=2.8.0",
        "pytz>=2021.1",
    ],
    extras_require={
        "dev": [
            "pytest>=6.0.0",
            "pytest-cov>=2.0.0",
            "black>=21.0.0",
            "flake8>=3.8.0",
            "mypy>=0.800",
            "jupyter>=1.0.0",
            "matplotlib>=3.3.0",
            "seaborn>=0.11.0",
        ],
        "backtest": [
            "matplotlib>=3.3.0",
            "seaborn>=0.11.0",
            "plotly>=5.0.0",
            "openpyxl>=3.0.0",
        ],
        "all": [
            "pytest>=6.0.0",
            "pytest-cov>=2.0.0",
            "black>=21.0.0",
            "flake8>=3.8.0",
            "mypy>=0.800",
            "jupyter>=1.0.0",
            "matplotlib>=3.3.0",
            "seaborn>=0.11.0",
            "plotly>=5.0.0",
            "openpyxl>=3.0.0",
        ],
    },
    entry_points={
        "console_scripts": [
            "coindcx-cli=coindcx_sdk.cli:main",
        ],
    },
    include_package_data=True,
    zip_safe=False,
)