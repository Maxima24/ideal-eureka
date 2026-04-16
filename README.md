# Stage 1 Backend Task — Data Persistence & API Design Assessment

## Overview

This project implements a REST API that aggregates user-related data from multiple external services, processes and classifies the data, and persists the result in a database with strict validation, idempotency, and response formatting rules.

The API is built as part of the Stage 1 Backend Assessment.

---

## 🚀 Features

- POST endpoint: `/api/profiles`
- Aggregates data from 3 external APIs:
  - Genderize API
  - Agify API
  - Nationalize API
- Data transformation and classification logic
- Idempotency handling (no duplicate profiles for same name)
- Strict input validation
- Robust error handling
- Database persistence with UUID v7 IDs
- CORS enabled for public access

---

## 📡 API Endpoint

### Create Profile

POST /api/profiles

### Request Body
```json
{
  "name": "ella"
}
