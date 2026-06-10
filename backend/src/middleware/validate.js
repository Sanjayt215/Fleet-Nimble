export function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse({
      body: req.body,
      query: req.query,
      params: req.params,
    });
    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: result.error.flatten(),
        },
      });
    }
    if (result.data.body) req.body = result.data.body;
    if (result.data.query) req.query = { ...req.query, ...result.data.query };
    if (result.data.params) req.params = { ...req.params, ...result.data.params };
    next();
  };
}
