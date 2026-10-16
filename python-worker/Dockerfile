FROM python:3.13-slim

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY main.py .

# Create a non-root user for security
RUN useradd --create-home --shell /workspace worker
USER worker

# Expose the worker port
EXPOSE 8000

# Environment variables for configuration
ENV WORKER_HOST=0.0.0.0 \
    WORKER_PORT=8000 \
    MODEL_NAME=isnet-general-use

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

# Start the worker
CMD ["python", "main.py"]