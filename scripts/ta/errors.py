class TAError(Exception):
    """Loi nghiep vu co ma, dung chung cho engine va validator."""

    def __init__(self, code, message="", **context):
        super().__init__("%s: %s" % (code, message))
        self.code = code
        self.message = message
        self.context = context
