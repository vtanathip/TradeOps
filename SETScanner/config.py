import os
from dotenv import load_dotenv

load_dotenv()

APP_ID = os.environ["SETTRADE_APP_ID"]
APP_SECRET = os.environ["SETTRADE_APP_SECRET"]
APP_CODE = os.environ.get("SETTRADE_APP_CODE", "SANDBOX")
BROKER_ID = os.environ.get("SETTRADE_BROKER_ID", "SANDBOX")
