#!/bin/bash

sed -i "s/10.0.0.1/$ZTP_IP/g" /app/script.py

sed -i "s/:8080/:$ZTP_PORT/g" /app/script.py

python app.py
