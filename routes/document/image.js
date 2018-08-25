const Joi = require('joi');
const Boom = require('boom');
const oracledb = require('oracledb');
const fs = require('fs');
const s3 = require('s3');
const uuid = require('uuid');
const sharp = require('sharp');
const { single_document } = require('./document');

const s3_client = s3.createClient({
	s3Options: {
		accessKeyId: process.env.S3_ACCESS_KEY_ID,
		secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
		region: "us-east-1",
	}
});
const s3_bucket = process.env.S3_BUCKET;

module.exports = [
	{
		method: 'POST',
		path: '/document/{doc_id}/image',
		config: {
			handler: post_image,
			plugins: {
				'hapi-swagger': {
					payloadType: 'form'
				}
			},
			description: 'Add an image to a document',
			notes: 'If section_id is not defined will add to the main document',
			auth: 'jwt',
			tags: ['api'],
			validate: {
				params: {
					doc_id : Joi.number().required().description('Document ID')
				},
				query: {
					section_id : Joi.number().description('Section ID')
				},
				payload: {
					file: Joi.any().meta({ swaggerType: 'file' }).description('Image file')
				}
			},
			payload: {
				maxBytes: 1048576,
				parse: true,
				output: 'stream'
			}
		}
	},
	{
		method: 'DELETE',
		path: '/document/{doc_id}/image/{image_id}',
		config: {
			handler: delete_image,
			description: 'Delete an image from a document',
			auth: 'jwt',
			tags: ['api'],
			validate: {
				params: {
					doc_id : Joi.number().required().description('Document ID'),
					image_id : Joi.number().required().description('Image ID')
				}
			}
		}
	}
];


async function post_image(request, reply) {

	//@TODO: Uncaught error: Missing required key 'Bucket' in aws-sdk

	try {

		const data = request.payload;

		if (data.file) {
			
			if (data.file.hapi.filename.match(/\.(jpg|jpeg|png|gif)$/)) {
				
				// Create image variables
				const file_ext = data.file.hapi.filename.split('.').pop();
				const file_prefix = `${uuid.v1()}`;
				const s3_dir = `docs/${request.params.doc_id}/`
				const lg_image = `${file_prefix}-lg.${file_ext}`;
				const xl_image = `${file_prefix}-xl.${file_ext}`;
				const hires_image = `${file_prefix}-hires.${file_ext}`;
				
				// Write to filesystem
				const path = "/tmp/" + hires_image;

				const file = fs.createWriteStream(path);
                const write_file = new Promise((resolve, reject) => {
                    file.on('finish', ()=> {
                        resolve(path)
                    });
                    data.file.on('error', reject);
                });

                data.file.pipe(file);
				const hires_file = await write_file;

				// Create resized images
				await sharp(hires_file).resize(600).toFile(`/tmp/${lg_image}`);
				await sharp(hires_file).resize(1200).toFile(`/tmp/${xl_image}`);

				// Save image to database
				const qry_insert_image = `
					INSERT INTO doc_images(doc_id, doc_section_id, lg_image, xl_image, hires_image, position)
					VALUES(:doc_id, :section_id, :lg_image, :xl_image, :hires_image,
						(SELECT NVL(MAX(position),0) + 1 FROM doc_images WHERE doc_id = :doc_id)
					)
					RETURNING doc_image_id INTO :new_image_id
				`;

				insert_image = await request.app.db.execute(qry_insert_image, {doc_id: request.params.doc_id,
					section_id: request.query.section_id, lg_image: lg_image, xl_image: xl_image, hires_image: hires_image,
					new_image_id: { type: oracledb.NUMBER, dir: oracledb.BIND_OUT } });

				// Upload to S3
				// @TODO - Simplify this
				const upload_lg_image = new Promise((resolve, reject) => {
					var uploader = s3_client.uploadFile(
						{ localFile: `/tmp/${lg_image}`, s3Params: { Bucket: s3_bucket, Key: s3_dir + lg_image } }
					);
					uploader.on('end', ()=>resolve('done uploading'));
					uploader.on('error', reject);
				});
				const upload_xl_image = new Promise((resolve, reject) => {
					var uploader = s3_client.uploadFile(
						{ localFile: `/tmp/${lg_image}`, s3Params: { Bucket: s3_bucket, Key: s3_dir + xl_image } }
					);
					uploader.on('end', ()=>resolve('done uploading'));
					uploader.on('error', reject);
				});
				const upload_hires_image = new Promise((resolve, reject) => {
					var uploader = s3_client.uploadFile(
						{ localFile: `/tmp/${lg_image}`, s3Params: { Bucket: s3_bucket, Key: s3_dir + hires_image } }
					);
					uploader.on('end', ()=>resolve('done uploading'));
					uploader.on('error', reject);
				});
				await upload_lg_image;
				await upload_xl_image;
				await upload_hires_image;

				await request.app.db.commit();

				// Get the updated document
				single_doc = await single_document(request.app.db, request.params.doc_id, 'simple');
				return reply(single_doc);

			} else {

				return reply(Boom.badRequest('File is not an image'))

			}

		} else {
			return reply(Boom.badRequest('Not a file'))
		}

	} catch(error) {
		
		// Check for an Oracle constraint error
		if (error.message.split(':')[0] == 'ORA-02291') {
			console.log(error);
			return reply(Boom.notFound('Document or section not found'));
		} else {
			console.log(error);
			return reply(error);
		}

	}

};


async function delete_image(request, reply) {

	try {

		//@TODO: Missing required key 'Bucket' in params of aws-sdk
		// Delete an image
		const qry_delete_image = `
			DELETE FROM doc_images
			WHERE doc_id = :doc_id 
			AND doc_image_id = :image_id
			RETURNING lg_image, xl_image, hires_image INTO :lg_image, :xl_image, :hires_image
		`;
		delete_image = await request.app.db.execute(qry_delete_image, {doc_id: request.params.doc_id,
			image_id: request.params.image_id,
			lg_image: { type: oracledb.STRING, dir: oracledb.BIND_OUT },
			xl_image: { type: oracledb.STRING, dir: oracledb.BIND_OUT },
			hires_image: { type: oracledb.STRING, dir: oracledb.BIND_OUT } });

		if (delete_image.rowsAffected > 0) {
			// Set names of images to delete
			const lg_image = delete_image.outBinds.lg_image[0];
			const xl_image = delete_image.outBinds.xl_image[0];
			const hires_image = delete_image.outBinds.hires_image[0];

			// Delete from S3
			const s3_dir = `docs/${request.params.doc_id}/`;
			const delete_file = new Promise((resolve, reject) => {
				var deleter = s3_client.deleteObjects(
					{
						Bucket: s3_bucket,
						Delete: {
						  	Objects: [
								{ Key: s3_dir + lg_image },
								{ Key: s3_dir + xl_image },
								{ Key: s3_dir + hires_image }
						  	],
						  	Quiet: false
						}
					}
				);
				deleter.on('end', ()=>resolve('finished deleting'));
				deleter.on('error', reject);
			});
			await delete_file;

			await request.app.db.commit();
		
			// Get the updated document
			single_doc = await single_document(request.app.db, request.params.doc_id, 'simple');

			return reply(single_doc);
		} else {
			return reply(Boom.notFound('Image not found'));
		}

	} catch(error) {
		
		console.log(error);
		return reply(error);

	}

};