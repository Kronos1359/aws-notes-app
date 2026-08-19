const { S3Client } = require("@aws-sdk/client-s3");

const s3Client = new S3Client({
    region: "ap-south-1"
});

module.exports = s3Client;