# syntax=docker/dockerfile:1.7

FROM python:3.11-slim AS backend

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    WEB_CONCURRENCY=2
WORKDIR /app

COPY backend_app/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt py-spy==0.4.1
COPY backend_app/app ./app
# Profile the route implementation rather than the shared 100 requests/minute IP limiter.
RUN sed -i 's/standard_rate_limit = limiter(times=100, seconds=60)/standard_rate_limit = limiter(times=100000, seconds=60)/' app/core/rate_limit.py

EXPOSE 8000
CMD ["sh", "-c", "exec gunicorn app.main:app --bind 0.0.0.0:8000 --worker-class uvicorn.workers.UvicornWorker --workers ${WEB_CONCURRENCY} --timeout 300 --keep-alive 5 --access-logfile -"]


FROM mcr.microsoft.com/azure-functions/python:4-python3.11 AS function

ENV AzureWebJobsScriptRoot=/home/site/wwwroot \
    AzureFunctionsJobHost__Logging__Console__IsEnabled=true \
    FUNCTIONS_WORKER_PROCESS_COUNT=1
WORKDIR /home/site/wwwroot
COPY az-func-audio/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt py-spy==0.4.1
COPY az-func-audio/ ./
# ponytail: Profile image only; remove this build-only rewrite if local host keys are mounted.
RUN sed -i 's/methods=\["POST"\])/methods=["POST"], auth_level=func.AuthLevel.ANONYMOUS)/' function_app.py
