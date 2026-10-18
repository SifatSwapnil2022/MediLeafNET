# Reproducible environment for the data pipeline (ingest + evaluation).
# Model export needs PyTorch and the checkpoint, so run that one on your own machine.
#
#   docker build -t medileaf-pipeline .
#   docker run --rm --env-file .env.local -v "$PWD:/app" medileaf-pipeline \
#       python scripts/ingest.py --csv data/CapC_medicinal_plants_with_id.csv --wikipedia --reset
#   docker run --rm --env-file .env.local -v "$PWD:/app" medileaf-pipeline \
#       python scripts/eval.py --api https://your-app.vercel.app --judge
FROM python:3.11-slim
WORKDIR /app
RUN pip install --no-cache-dir requests "upstash-vector>=0.6" "groq>=0.11" pandas
COPY scripts ./scripts
COPY data ./data
CMD ["python", "scripts/eval.py", "--help"]
