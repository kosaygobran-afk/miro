FROM python:3.13-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY main.py .
RUN useradd --create-home --shell /bin/sh worker
USER worker
ENV WORKER_HOST=0.0.0.0 WORKER_PORT=8000
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD python -c "import json, urllib.request; r=json.load(urllib.request.urlopen('http://localhost:8000/health', timeout=5)); assert r['status'] == 'healthy'"
CMD ["python", "main.py"]
