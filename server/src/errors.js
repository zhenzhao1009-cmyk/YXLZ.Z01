class ApiError extends Error {
  constructor(status, error, message) {
    super(message);
    this.status = status;
    this.error = error;
  }
}

// 全局错误 → 统一信封转换
function errorHandler(err, req, res, next) {
  if (err instanceof ApiError) {
    return res.status(err.status).json({ code: err.status, message: err.message, error: err.error });
  }
  if (err.type === 'entity.parse.failed' || err instanceof SyntaxError) {
    return res.status(400).json({ code: 400, message: '请求参数格式错误', error: 'VALIDATION' });
  }
  // multer 的各类客户端上传错误统一按 400 处理,而非 500
  if (err.code && err.code.startsWith('LIMIT_')) {
    const messages = {
      LIMIT_FILE_SIZE: '文件大小超过 20MB 限制',
      LIMIT_UNEXPECTED_FILE: '上传字段不正确或携带了多余文件,请重试',
      LIMIT_FILE_COUNT: '上传文件数量超限',
      LIMIT_UNEXPECTED_FILE_SIZE: '文件大小超过限制',
    };
    return res.status(400).json({ code: 400, message: messages[err.code] || '上传内容超出限制', error: 'VALIDATION' });
  }
  console.error(err);
  return res.status(500).json({ code: 500, message: '服务器异常', error: 'INTERNAL' });
}

module.exports = { ApiError, errorHandler };
