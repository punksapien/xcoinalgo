"""
xcoin-cli: Strategy development toolkit for xcoinalgo quant teams
"""

from setuptools import setup, find_packages
import pathlib

HERE = pathlib.Path(__file__).parent
README = (HERE / "README.md").read_text(encoding="utf-8") if (HERE / "README.md").exists() else ""

setup(
    name="xcoin-cli",
    version="0.1.0",
    description="xcoinalgo CLI - Strategy development toolkit for quant teams",
    long_description=README,
    long_description_content_type="text/markdown",
    author="xcoinalgo",
    author_email="dev@xcoinalgo.com",
    url="https://github.com/xcoinalgo/xcoin-cli",
    license="MIT",
    packages=find_packages(exclude=["tests", "tests.*"]),
    include_package_data=True,
    package_data={
        "xcoin_cli": [
            "templates/*.py",
            "templates/*.json",
            "templates/*.txt",
            "templates/*.md",
            "templates/*",
        ],
    },
    python_requires=">=3.8",
    install_requires=[
        "click>=8.0.0",
        "rich>=13.0.0",
        "requests>=2.28.0",
        "pandas>=2.0.0",
        "numpy>=1.24.0",
        "PyYAML>=6.0",
        "python-dotenv>=1.0.0",
        "cryptography>=41.0.0",
    ],
    extras_require={
        "backtest": ["pandas-ta"],
    },
    entry_points={
        "console_scripts": [
            "xcoin=xcoin_cli.cli:cli",
        ],
    },
    classifiers=[
        "Development Status :: 4 - Beta",
        "Intended Audience :: Developers",
        "License :: OSI Approved :: MIT License",
        "Programming Language :: Python :: 3",
        "Programming Language :: Python :: 3.8",
        "Programming Language :: Python :: 3.9",
        "Programming Language :: Python :: 3.10",
        "Programming Language :: Python :: 3.11",
    ],
    keywords="trading, algorithmic-trading, cryptocurrency, strategy, cli",
)
