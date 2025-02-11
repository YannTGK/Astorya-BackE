//authMiddleware.js is a middleware that verifies the token sent by the user in the request header.
import jwt from "jsonwebtoken";

const verifyToken = (req, res, next) => {
    const token = req.headers.authorization?.split(" ")[1];

    if (!token) return res.status(401).json({ message: "Unauthorized" });

    jwt.verify(token, process.env.JWT_SECRET_KEY, (err, decoded) => {
        if (err) return res.status(403).json({ message: "Invalid token" });

        req.user = decoded; // Store decoded user info in request
        next(); // Move to next middleware
    });
};

export default verifyToken;