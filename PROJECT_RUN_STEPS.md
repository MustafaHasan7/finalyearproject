# Run Steps: Chapter 10 Sequence Analysis Project

## Start the project

Run these commands from one Linux terminal:

```bash
cd /home/mustafa/Downloads/FYP/DS_F25/labook-code-main/book1_Chapter10_Sequence_Analysis_Basic_Principles_and_Technique
python3 -m pip install fastapi "uvicorn[standard]" pydantic joblib scikit-learn pandas numpy openpyxl
python3 backend/run_sequence_pipeline.py
python3 -m uvicorn backend.api:app --host 127.0.0.1 --port 9510 &
python3 -m http.server 8510
```

## Open in browser

```text
http://127.0.0.1:8510/frontend/index.html
```

## Stop the project

Press `Ctrl+C` to stop the frontend server.

Then stop the backend:

```bash
kill %1
```
