# Strategy Sandbox - Isolated execution environment for strategy validation
# Resource limits: 512MB RAM, 0.5 CPUs, No network access
FROM python:3.12-slim

# Install essential packages only
RUN apt-get update && apt-get install -y \
    --no-install-recommends \
    gcc \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user for security
RUN useradd -m -u 1000 -s /bin/bash sandbox && \
    mkdir -p /workspace /tmp/sandbox && \
    chown -R sandbox:sandbox /workspace /tmp/sandbox

# Install common data science packages
# These are pre-installed to speed up execution
RUN pip install --no-cache-dir \
    pandas==2.1.4 \
    numpy==1.26.3 \
    ta==0.11.0 \
    pytz==2024.1 \
    python-dateutil==2.8.2

# Set working directory
WORKDIR /workspace

# Switch to non-root user
USER sandbox

# Set Python to unbuffered mode for real-time output
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1

# Default command (will be overridden)
CMD ["/bin/bash"]
