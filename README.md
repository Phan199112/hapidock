# Pilot API V2
This project contains the new Pilot API, built with Node.js and HAPI. It will be available at `https://rest.crowleymarine.com/v2/` and `https://rest-dev.crowleymarine.com/v2/` The Swagger docs are available at the root URL.

# Resources

## /document/
All resources under `/document/` require JWT authentication, except for `GET /documents` where a JWT token is optional. You can use the token created at either `/a/user/login` (Standard user) or `/p/login` (Dealer Admin user). The API will assign the correct permissions based on the token used.

### Standard user
A Standard user is one who registered on `https://cart.crowleymarine.com`. This user has access to create new documents and edit their own documents. They do not have access to change a document status to `published`.

### Dealer Admin user
A Dealer Admin user has access to read and edit all documents as well as change a document status to `published`.

# Redis
We connect to the following Redis databases, depending on the context.  
1. Staging  
2. Production  
3. pilotAPI2 (local)  
4. pilotCMS2 (local)  
The staging and production environments in ECS use their respective databases in ElastiCache. Public access to ElastiCache is restricted however so we must use local instances for development.

# Docker
We are using Docker for both testing and production. `docker-compose up` will start the test server on port 3000.  

Environment variables need to be set. You can set them manually or create a `.env` file for Docker to read.  Look at `.env_example` for more information.