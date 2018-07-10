const Joi = require('joi');
const Boom = require('boom');

module.exports = [
	{
		method: 'GET',
		path: '/documents',
		config: {
			handler: get_documents,
			description: 'Returns one or more documents',
			auth: {
				strategy: 'jwt',
				mode: 'optional'
	        },
			tags: ['api'],
			validate: {
				query: {
					doc_group : Joi.string().required().description('Document group'),
					doc_key : Joi.string().description('Document key'),
					tag_id : Joi.string().description('Tag ID')
				}
			}
		}
	}
];

// One or more Documents
async function get_documents(request, reply) {

	try {

		// Setup user credentials
		const isAuthenticated = +request.auth.isAuthenticated;
		let user_id = '', user_type = '';
		if ( isAuthenticated ) {
			user_id = request.auth.credentials.userid;
			user_type = request.auth.credentials.role;
		}

		const doc_query = `
			SELECT d.doc_id "doc_id", d.doc_group "doc_group", d.doc_key "doc_key", d.doc_link "doc_link", d.date_added "date_added", d.date_updated "date_updated",
			    d.title "title", d.priority "priority", d.status "status", i.thumbnail "thumbnail", t.tags "tags",
			    NVL2(a.mfg_account_id,
			    	'{"mfg_account_id":'||a.mfg_account_id||',"article_type":"'||a.article_type||'"}',
			    	'{}') "tech_article"
			FROM doc d LEFT OUTER JOIN
			    (
			        SELECT doc_id, MIN(lg_image) KEEP (DENSE_RANK FIRST ORDER BY position) AS thumbnail
			        FROM doc_images
			        GROUP BY doc_id
			    ) i
			ON d.doc_id = i.doc_id
			LEFT OUTER JOIN
		    (
		        -- Build JSON array
		        -- Can replace with a JSON function in 12.2
		        SELECT doc_id, '['||LISTAGG('{"tag_id":"'||t1.tag_id||'","name":"'||name||'"}', ',')
		        	WITHIN GROUP (ORDER BY name)||']' tags
		        FROM doc_tags t1 JOIN doc_tag t2
		        ON t1.tag_id = t2.tag_id
		        GROUP BY doc_id
		    ) t
		    ON d.doc_id = t.doc_id
		    LEFT OUTER JOIN doc_article a
		    ON d.doc_id = a.doc_id
			WHERE d.doc_group = :doc_group
			AND (d.doc_key = :doc_key OR :doc_key IS NULL)
			AND (d.doc_id IN (SELECT doc_id FROM doc_tags WHERE tag_id = :tag_id) OR :tag_id IS NULL)
			AND (
				(:isAuthenticated = 1 AND :user_type = 'acai' AND d.user_id = to_char(:user_id))
				OR (:isAuthenticated = 1 AND :user_type = 'pilot')
				OR (:isAuthenticated = 0 AND d.status = 'published')
			)
		`;
		const doc_result = await request.app.db.execute(doc_query, {isAuthenticated: isAuthenticated, user_id: user_id, user_type: user_type,
			doc_group: request.query.doc_group, doc_key: request.query.doc_key, tag_id: request.query.tag_id}, {outFormat: 4002});
		const doc = doc_result.rows

		// Convert tags string to JSON array
		doc.map(v => v.tags = (v.tags ? JSON.parse(v.tags) : []));

		// Convert tech_article string to JSON object
		doc.map(v => v.tech_article = JSON.parse(v.tech_article));

		if (doc.length == 0) {
			return reply(Boom.notFound('Document not found'));
		} else {
			return reply(doc);
		}

	} catch(error) {
		
		console.log(error);
		return reply(error);

	}

};