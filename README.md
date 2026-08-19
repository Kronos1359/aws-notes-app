# AWS Notes App

A full-stack notes application built with **Vue.js, Node.js, and AWS serverless services**.

The application allows users to create, view, edit, and delete notes, with image upload support using Amazon S3.

## Features

* Create notes
* View notes
* Edit existing notes
* Delete notes
* Upload images to Amazon S3
* Store note data in Amazon DynamoDB
* REST API built with Node.js and Express
* Vue.js frontend
* Serverless AWS Lambda support
* Organized backend using controllers, routes, and services

## Tech Stack

### Frontend

* Vue.js
* Vite
* JavaScript
* HTML
* CSS

### Backend

* Node.js
* Express.js
* AWS SDK for JavaScript
* REST API

### AWS Services

* **Amazon DynamoDB** — stores note data
* **Amazon S3** — stores uploaded images
* **AWS Lambda** — supports serverless backend execution

## Project Structure

```text
aws-notes-app/
│
├── backend/
│   ├── src/
│   │   ├── controllers/
│   │   │   └── notesController.js
│   │   ├── routes/
│   │   │   └── notes.js
│   │   ├── services/
│   │   │   ├── dynamodb.js
│   │   │   └── s3.js
│   │   ├── app.js
│   │   ├── lambda.js
│   │   └── server.js
│   │
│   ├── package.json
│   └── package-lock.json
│
├── frontend/
│   ├── public/
│   ├── src/
│   │   ├── App.vue
│   │   └── main.js
│   ├── index.html
│   ├── package.json
│   └── package-lock.json
│
├── .gitignore
└── README.md
```

## Architecture

The application follows this general flow:

```text
Vue.js Frontend
       │
       │ HTTP Requests
       ▼
Node.js / Express Backend
       │
       ├──────────────► Amazon DynamoDB
       │                 Note data
       │
       └──────────────► Amazon S3
                         Uploaded images

AWS Lambda
     │
     └── Serverless execution of the backend
```

## AWS Configuration

The backend uses the AWS SDK to communicate with AWS services.

Before running the backend, configure AWS credentials using the AWS CLI or another supported AWS credential provider.

For example:

```bash
aws configure
```

You will need AWS credentials with permissions appropriate for the services used by the application.

**Never commit AWS access keys, secret keys, or other credentials to GitHub.**

## Running the Backend

Navigate to the backend directory:

```bash
cd backend
```

Install dependencies:

```bash
npm install
```

Start the backend:

```bash
node src/server.js
```

The API will then be available at the configured local port.

## Running the Frontend

Open another terminal and navigate to the frontend:

```bash
cd frontend
```

Install dependencies:

```bash
npm install
```

Start the Vite development server:

```bash
npm run dev
```

Vite will provide a local URL that can be opened in the browser.

## Environment Variables

If environment variables are required, create a `.env` file locally.

Example:

```env
AWS_REGION=your-region
S3_BUCKET_NAME=your-bucket-name
DYNAMODB_TABLE_NAME=your-table-name
```

Do not commit your actual `.env` file.

An `.env.example` file can be used to document required variables without exposing secrets.

## API Operations

The backend provides REST endpoints for managing notes.

Typical operations include:

| Method | Purpose        |
| ------ | -------------- |
| GET    | Retrieve notes |
| POST   | Create a note  |
| PUT    | Update a note  |
| DELETE | Delete a note  |

Image uploads are handled through Amazon S3.

## What I Learned

This project was built to practice working with cloud-based application architecture and AWS services.

Key areas covered:

* Building REST APIs with Node.js and Express
* Connecting a backend application to DynamoDB
* Uploading and managing objects with Amazon S3
* Using the AWS SDK
* Working with AWS IAM permissions
* Understanding serverless architecture with Lambda
* Connecting a Vue.js frontend to a backend API
* Managing a full-stack project with Git and GitHub
* Structuring a project into frontend, backend, controllers, routes, and services

## Future Improvements

Planned improvements include:

* Authentication and user accounts
* User-specific notes
* Improved UI/UX
* Image previews
* Note search and filtering
* Better error handling
* Deployment of the frontend and backend
* Fully serverless production architecture
* Automated deployment using CI/CD

## Status

**In development**

The core CRUD functionality and AWS integrations have been implemented. The project is being actively improved as part of my learning and cloud development work.
