"""Zero-config entry point: Railway's Railpack builder runs `python main.py` when it finds this file.
Equivalent to: uvicorn app:app --host 0.0.0.0 --port $PORT"""

import os

import uvicorn

if __name__ == '__main__':
    uvicorn.run('app:app', host=os.environ.get('HOST', '0.0.0.0'), port=int(os.environ.get('PORT', '8787')), proxy_headers=False)
