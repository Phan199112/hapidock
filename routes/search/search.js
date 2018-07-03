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

	try {

		// Send Elasticsearch request
		const response = await client.msearch({
			body: [
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
				},
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
				},
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
		  if (i == 0 || i == 1) {
		  	results['models'] = results['models'].concat(searchResults);
		  }
		  // products
		  if (i == 2) {
		  	results['products'] = searchResults;
		  }
		  // pages
		  if (i == 3) {
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