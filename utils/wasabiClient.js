import AWS from 'aws-sdk';
import dotenv from 'dotenv';

dotenv.config();

const wasabi = new AWS.S3({
  endpoint: new AWS.Endpoint('s3.eu-central-1.wasabisys.com'),
  accessKeyId: process.env.WASABI_ACCESS_KEY,
  secretAccessKey: process.env.WASABI_SECRET_KEY,
  region: 'eu-central-1',
});

export default wasabi;