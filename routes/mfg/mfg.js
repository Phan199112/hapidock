const Joi = require('joi');

module.exports = [
    {
        method: 'GET',
        path: '/mfg/orders',
        config: {
            handler: get_mfg_orders,
            description: 'Gets manufacturer order',
            notes: 'Returns one or more manufacturer orders',
            auth: 'jwt',
            tags: ['api'],
            validate: {
                query: {
                    invoice_no: Joi.string(),
                    tracking_number: Joi.string()
                }
            }
        }
    }
];

async function get_mfg_orders(request, reply) {

	try {

		// Get manufacturer orders
        var mfg_orders_query = `
            SELECT m.po_no "po_no", m.status "order_status", o.invoice_no "invoice_no", o.status "line_status", o.quantity "quantity",
                p.name "name", p.sku "sku", o.sku "mfg_sku", o.quantity_shipped "quantity_shipped", o.quantity_bo "quantity_bo",
                o.quantity_nla "quantity_nla", o.cost "cost", o.tracking_number "tracking_number"
            FROM mfg_order_no m, mfg_orders o, products p
            WHERE m.mfg_order_no = o.mfg_order_no
            AND o.product_id = p.product_id
            AND (:invoice_no IS NULL OR invoice_no = :invoice_no)
            AND (:tracking_number IS NULL OR tracking_number = :tracking_number)
            ORDER BY po_no DESC, p.sku
        `;
		mfg_orders_result = await request.app.db.execute(mfg_orders_query, {invoice_no: request.query.invoice_no,
            tracking_number: request.query.tracking_number}, {outFormat: 4002});
        mfg_orders = mfg_orders_result.rows;

        reply(mfg_orders);

	} catch(error) {
		
		console.log(error);
		reply(error);

	}

};