'use strict';

const Hapi = require('hapi');
const Inert = require('inert');
const Vision = require('vision');
const server = new Hapi.Server();

server.connection({
    host: '0.0.0.0',
    port: 3001
});

const provision = async () => {

    try {

        await server.register(
            [
                { 'register': require('hapi-auth-jwt2') },
                { 'register': require('hapi-auth-ip-whitelist') },
                { 'register': require('therealyou') }
            ]
        );

        // JWT Auth
        await server.auth.strategy('jwt', 'jwt',
            { key: '7b7e5a9d-03b3-41a8-8c48-c51149a72b0d', // Secret key
                validateFunc: validate, // Validate function
                verifyOptions: { algorithms: [ 'HS256' ] }
        });

        // IP Address Auth
        // @TODO - Pull the IP Addresses from Oracle
        await server.auth.strategy('admin_ips', 'ip-whitelist', ['179.7.148.90','185.13.113.108']);

        // await server.auth.default('jwt');

        await server.register(
            [
                Inert,
                Vision,
                {
                    'register': require('hapi-swagger'),
                    'options': {
                        info: { // metadata rendered in the Swagger UI
                            title: 'Pilot API V2',
                            description: 'Pilot API V2',
                            version: '2.0.0'
                        },
                        securityDefinitions: {
                            'jwt': {
                                'type': 'apiKey',
                                'name': 'Authorization',
                                'in': 'header'
                            }
                        },
                        security: [{ 'jwt': [] }],
                        basePath: '/v2/',
                        pathPrefixSize: 2,
                        documentationPath: '/v2/',
                        swaggerUIPath: '/v2/swaggerui/',
                        jsonPath: '/v2/swagger.json',
                        auth: (process.env.NODE_ENV == 'development') ? false : 'admin_ips'
                    }
                },
                {
                    'register': require('hapi-plugin-oracledb'),
                    'options': {
                        connectString: process.env.CONNECT_STRING,
                        user: process.env.USERNAME,
                        password: process.env.PASSWORD
                    }
                }
            ]
        );

        await server.register(
            [
                {
                    'register': require('hapi-router'),
                    'options': {
                        oracledb: true,
                        routes: 'routes/*/*.js'
                    }
                }
            ],
            { routes: { prefix: '/v2' } }
        );

        await server.start();

        console.log('Server running at:', server.info.uri);
        

    } catch(error) {
        
        console.log(error);

    }

};

provision();

// JWT Validation function
const validate = async function (decoded, request, callback) {

    try {
        // Extended validation on /document/{doc_id}
        // Make sure user is authorized for a specific document
        if ( request.route.path.startsWith('/document/{doc_id}') ) {

            const qry_validate_user = `
                SELECT user_id FROM doc
                WHERE user_id = :user_id
                AND user_type = :role
                AND doc_id = :doc_id
            `;
            const validate_user = await request.app.db.execute(qry_validate_user, {doc_id: request.params.doc_id,
                user_id: decoded.userid, role: decoded.role});
            
            const is_authorized = validate_user.rows.length;

            if (!is_authorized) {
                return callback(null, false);
            }
        }
        
        return callback(null, true);

    } catch(error) {
        
        console.log(error);

    }

};