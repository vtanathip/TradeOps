import os
from dotenv import load_dotenv

load_dotenv()

APP_ID = os.environ["PI_ALGO_APP_ID"]
APP_SECRET = os.environ["PI_ALGO_APP_SECRET"]
APP_CODE = os.environ.get("PI_ALGO_APP_CODE", "SANDBOX")
BROKER_ID = os.environ.get("PI_ALGO_BROKER_ID", "SANDBOX")
