const Joi = require('joi');

module.exports = [
	{
		method: 'GET',
		path: '/search/{search_parameter}',
		config: {
				handler: search,
				description: 'Get Elasticsearch search results.',
				notes: 'Returns Elasticsearch search results using search parameter',
				tags: ['api'],
				validate: {
					params: {
						search_parameter: Joi.string().required()
					},
					query: {
						debug: Joi.boolean().description('Debug mode'),
						index: Joi.string().valid(['models','products','pages']).description('Index to return'),
						page_number: Joi.number().default(1).description('Page number')
					}
				}
		}
	},
	{
		method: 'GET',
		path: '/search/{search_parameter}/suggest',
		config: {
				handler: suggest,
				description: 'Get Elasticsearch search suggestions.',
				notes: 'Returns Elasticsearch search suggestions using search parameter',
				tags: ['api'],
				validate: {
					params: {
						search_parameter: Joi.string().required()
					},
					query: {
						debug: Joi.boolean().description('Debug mode')
					}
				}
		}
	}
];

async function search(request, reply) {

	const client = request.es;
	const index = request.query.index;

	try {

		// models query
		const models_query = [
			{ index: 'models', type: 'models_es' },
	    	{
	    	'query': {
					'multi_match': {
		        'query': request.params.search_parameter,
		        'fields': ['mfg_name', 'product_line', 'year', 'engine', 'model'],
		        'type': 'most_fields'
		    	}
				},
					'from': request.query.page_number - 1,
		    	'size': 10
			},
			{ index: 'serials', type: 'serials_es' },
	    	{
	    	'query': {
					'multi_match': {
		        'query': request.params.search_parameter,
		        'fields': ['serial_number'],
		        'type': 'most_fields'
		    	}
				},
					'from': request.query.page_number - 1,
		    	'size': 10
			}
		];

		// products query
		const products_query = [
			{ index: 'products', type: 'products_es' },
	    	{
	    	'query': {
					'multi_match': {
		        'query': request.params.search_parameter,
		        'fields': ['sku^2', 'superceding_products.sku^2', 'interchange.sku^2'],
		        'type': 'most_fields'
		    	}
				},
					'from': request.query.page_number - 1,
		    	'size': 10
			}
		]

		// pages query
		const pages_query = [
			{ index: 'pages', type: 'pages_es' },
	    	{
	    	'query': {
					'multi_match': {
		        'query': request.params.search_parameter,
		        'fields': ['diagram.alt_title', 'diagram.notes', 'diagram.page_title', 'diagram.result', 'parts.footnote_text', 'parts.sku^2', 'parts.partno', 'parts.name^2'],
		        'type': 'most_fields'
		    	}
				},
					'from': request.query.page_number - 1,
		    	'size': 10
			}
		]

		// Combine search queries
		let es_query = []
		if (index == 'models') {
			es_query = models_query;
		}
		else if (index == 'products') {
			es_query = products_query;
		}
		else if (index == 'pages') {
			es_query = pages_query;
		}
		else {
			es_query = models_query.concat( products_query, pages_query );
		}

		// Send Elasticsearch request
		const response = await client.msearch({
			body: es_query
		})

		// Clean up response object
		let results = {}
		results['models'] = []
		results['products'] = []
		results['pages'] = []
		for (const [i, r] of response.responses.entries()) {

		  // Move _source to root
		  searchResults = r.hits.hits.map(result => result['_source']);

		  // models
		  // Concatenate the 'models' and 'serials' response
		  if ((!index && (i == 0 || i == 1)) || index == 'models') {
		  	results['models'] = results['models'].concat(searchResults);
		  }
		  // products
		  if ((!index && i == 2) || (index == 'products' && i == 0)) {
		  	results['products'] = searchResults;
		  }
		  // pages
		  if ((!index && i == 3) || (index == 'pages' && i == 0)) {
		  	results['pages'] = searchResults;
		  }
		}

		// Add results for debug mode
		if (request.query.debug) {
			results['debug'] = response
		}

		reply(results);

	} catch(error) {
		
		console.log(error);
		reply(error);

	}

};

async function suggest(request, reply) {

	const client = request.es;

	try {

		// Send Elasticsearch request
		const response = await client.msearch({
			body: [
				{ index: 'models', type: 'models_es' },
		    {
					'suggest': {
						'models-suggest': {
							'prefix': request.params.search_parameter, 
							'completion': { 
								'field': 'model.suggest'
							}
						}
					}
				},
				{ index: 'serials', type: 'serials_es' },
		    {
					'suggest': {
						'serial-suggest': {
							'prefix': request.params.search_parameter, 
							'completion': { 
								'field': 'serial_number.suggest'
							}
						}
					}
				},
				{ index: 'products', type: 'products_es' },
		    {
					'suggest': {
						'products-suggest': {
							'prefix': request.params.search_parameter, 
							'completion': { 
								'field': 'sku.suggest'
							}
						}
					}
				}
			]
		})

		// Clean up response object
		let results = {}
		results['models'] = []
		results['products'] = []
		for (const [i, r] of response.responses.entries()) {
			suggestKey = Object.keys(r.suggest)[0]
		  suggestResults = r.suggest[suggestKey][0]['options']

		  // Move _source to root
		  suggestResults = suggestResults.map(result => result['_source']);

		  // models
		  if (suggestKey == 'models-suggest' || suggestKey == 'serial-suggest') {
		  	results['models'] = results['models'].concat(suggestResults);
		  }
		  // products
		  if (suggestKey == 'products-suggest') {
		  	results['products'] = suggestResults;
		  }
		}

		// Add results for debug mode
		if (request.query.debug) {
			results['debug'] = response
		}

		reply(results);

	} catch(error) {
		
		console.log(error);
		reply(error);

	}

};