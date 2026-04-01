FROM python:3.12-slim

WORKDIR /app

# Install dependencies first (cache layer)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy pipeline source into a proper Python package directory
COPY . ./pipelines/

EXPOSE 8000

# Run FastAPI server via uvicorn — using package-qualified import
# so Python resolves relative imports correctly
CMD ["uvicorn", "pipelines.server:app", "--host", "0.0.0.0", "--port", "8000"]
