FROM python:3.8

RUN pip install bottle waitress

COPY app.py index.html main.js style.css script.py docker-entrypoint.sh /app/

WORKDIR /app

ENTRYPOINT ["./docker-entrypoint.sh"]
