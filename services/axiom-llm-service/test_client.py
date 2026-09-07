#!/usr/bin/env python3
"""
Test client demonstrating how to call Axiom LLM Service from any application,
Python script, or microservice.
"""

import sys
import json
import requests

BASE_URL = "http://localhost:8000"

def test_health():
    print(f"\n[1] Checking Health: {BASE_URL}/health ...")
    try:
        res = requests.get(f"{BASE_URL}/health", timeout=5)
        print(f"Status: {res.status_code}")
        print(json.dumps(res.json(), indent=2))
    except Exception as e:
        print(f"Failed to connect to {BASE_URL}: {e}")
        print("Make sure the server is running: uvicorn app.main:app --port 8000")

def test_query(prompt="How do I sanitize user input in Node.js to prevent SQL injection?"):
    print(f"\n[2] Testing Universal Query: {BASE_URL}/api/query ...")
    payload = {
        "query": prompt,
        "max_tokens": 512,
        "temperature": 0.2
    }
    try:
        res = requests.post(f"{BASE_URL}/api/query", json=payload, timeout=60)
        print(f"Status: {res.status_code}")
        data = res.json()
        print(f"Duration: {data.get('duration_ms')}ms | Generated: {data.get('tokens_generated')} tokens")
        print("\n--- Response ---")
        print(data.get("reply"))
        print("----------------")
    except Exception as e:
        print(f"Query failed: {e}")

def test_security_analysis():
    print(f"\n[3] Testing Codefy Security Triage: {BASE_URL}/api/security/analyze ...")
    payload = {
        "query": "How do I fix this SQL injection and what safe replacement should I use?",
        "findings": [
            {
                "id": "F-10291",
                "severity": "critical",
                "title": "SQL Injection in users API",
                "cwe": "CWE-89",
                "filePath": "api/users.ts",
                "line": 42,
                "code": "const query = 'SELECT * FROM users WHERE id = ' + req.body.id;",
                "reason": "String concatenation allows attackers to alter query structure."
            }
        ],
        "selected_finding_id": "F-10291"
    }
    try:
        res = requests.post(f"{BASE_URL}/api/security/analyze", json=payload, timeout=60)
        print(f"Status: {res.status_code}")
        data = res.json()
        print("\n--- Security Triage Response ---")
        print(data.get("reply"))
        print("--------------------------------")
        print(f"Referenced Finding IDs: {data.get('referenced_finding_ids')}")
    except Exception as e:
        print(f"Security analysis failed: {e}")

if __name__ == "__main__":
    if len(sys.argv) > 1:
        BASE_URL = sys.argv[1].rstrip("/")
    print(f"Connecting to Axiom LLM Service at: {BASE_URL}")
    test_health()
    test_query()
    test_security_analysis()
