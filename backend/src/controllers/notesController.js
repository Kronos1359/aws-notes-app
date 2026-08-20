const crypto = require("crypto");

const {
    PutCommand,
    ScanCommand,
    GetCommand,
    UpdateCommand,
    DeleteCommand
} = require("@aws-sdk/lib-dynamodb");

const { GetObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const { PutObjectCommand } = require("@aws-sdk/client-s3");

const docClient = require("../services/dynamodb");
const s3Client = require("../services/s3");

const TABLE_NAME = "Notes";
const BUCKET_NAME = "aws-notes-app-images-474939504380";


/*
=========================================================
GET ALL NOTES
Only return notes belonging to the logged-in user.
=========================================================
*/

const getAllNotes = async (req, res) => {
    try {
        const userId = req.user.sub;

        const command = new ScanCommand({
            TableName: TABLE_NAME,

            FilterExpression: "userId = :userId",

            ExpressionAttributeValues: {
                ":userId": userId
            }
        });

        const result = await docClient.send(command);

        const notes = result.Items || [];

        // Sort newest notes first
        notes.sort((a, b) =>
            new Date(b.createdAt) - new Date(a.createdAt)
        );

        // Generate signed URLs for this user's images
        for (const note of notes) {
            if (note.imageKey) {
                const imageCommand = new GetObjectCommand({
                    Bucket: BUCKET_NAME,
                    Key: note.imageKey
                });

                note.imageUrl = await getSignedUrl(
                    s3Client,
                    imageCommand,
                    {
                        expiresIn: 3600
                    }
                );
            }
        }

        res.json(notes);

    } catch (error) {
        console.error(error);

        res.status(500).json({
            message: "Failed to get notes"
        });
    }
};


/*
=========================================================
GET ONE NOTE
Only the owner can access it.
=========================================================
*/

const getNote = async (req, res) => {
    try {
        const id = req.params.id;
        const userId = req.user.sub;

        const command = new GetCommand({
            TableName: TABLE_NAME,

            Key: {
                id
            }
        });

        const result = await docClient.send(command);

        if (!result.Item) {
            return res.status(404).json({
                message: "Note not found"
            });
        }

        const note = result.Item;

        // Ownership check
        if (note.userId !== userId) {
            return res.status(404).json({
                message: "Note not found"
            });
        }

        if (note.imageKey) {
            const imageCommand = new GetObjectCommand({
                Bucket: BUCKET_NAME,
                Key: note.imageKey
            });

            note.imageUrl = await getSignedUrl(
                s3Client,
                imageCommand,
                {
                    expiresIn: 3600
                }
            );
        }

        res.json(note);

    } catch (error) {
        console.error(error);

        res.status(500).json({
            message: "Failed to get note"
        });
    }
};


/*
=========================================================
CREATE NOTE
The userId comes from the verified Cognito token.
NOT from the frontend.
=========================================================
*/

const createNote = async (req, res) => {
    try {
        const { title, content } = req.body;

        const userId = req.user.sub;

        const id = crypto.randomUUID();

        const now = new Date().toISOString();

        const note = {
            id,
            userId,
            title,
            content,
            createdAt: now,
            updatedAt: now
        };

        const command = new PutCommand({
            TableName: TABLE_NAME,
            Item: note
        });

        await docClient.send(command);

        res.status(201).json(note);

    } catch (error) {
        console.error(error);

        res.status(500).json({
            message: "Failed to create note"
        });
    }
};


/*
=========================================================
UPDATE NOTE
Only the owner can update it.
=========================================================
*/

const updateNote = async (req, res) => {
    try {
        const id = req.params.id;
        const { title, content } = req.body;

        const userId = req.user.sub;

        const command = new UpdateCommand({
            TableName: TABLE_NAME,

            Key: {
                id
            },

            UpdateExpression:
                "SET title = :title, content = :content, updatedAt = :updatedAt",

            ConditionExpression:
                "userId = :userId",

            ExpressionAttributeValues: {
                ":title": title,
                ":content": content,
                ":updatedAt": new Date().toISOString(),
                ":userId": userId
            },

            ReturnValues: "ALL_NEW"
        });

        const result = await docClient.send(command);

        res.json(result.Attributes);

    } catch (error) {
        console.error(error);

        // DynamoDB throws ConditionalCheckFailedException
        // when the note belongs to somebody else.
        if (error.name === "ConditionalCheckFailedException") {
            return res.status(404).json({
                message: "Note not found"
            });
        }

        res.status(500).json({
            message: "Failed to update note"
        });
    }
};


/*
=========================================================
DELETE NOTE
Only the owner can delete it.
=========================================================
*/

const deleteNote = async (req, res) => {
    try {
        const id = req.params.id;

        const userId = req.user.sub;

        const command = new DeleteCommand({
            TableName: TABLE_NAME,

            Key: {
                id
            },

            ConditionExpression:
                "userId = :userId",

            ExpressionAttributeValues: {
                ":userId": userId
            }
        });

        await docClient.send(command);

        res.json({
            message: "Note deleted"
        });

    } catch (error) {
        console.error(error);

        if (error.name === "ConditionalCheckFailedException") {
            return res.status(404).json({
                message: "Note not found"
            });
        }

        res.status(500).json({
            message: "Failed to delete note"
        });
    }
};


/*
=========================================================
UPLOAD IMAGE
Only the owner of the note can upload an image.

S3 path becomes:

users/<userId>/notes/<noteId>/<random>-<filename>

=========================================================
*/

const uploadImage = async (req, res) => {
    try {
        const noteId = req.params.id;

        const userId = req.user.sub;

        if (!req.file) {
            return res.status(400).json({
                message: "No image uploaded"
            });
        }

        /*
        -------------------------------------------------
        First verify that this note belongs to the user.
        -------------------------------------------------
        */

        const getCommand = new GetCommand({
            TableName: TABLE_NAME,

            Key: {
                id: noteId
            }
        });

        const result = await docClient.send(getCommand);

        if (!result.Item) {
            return res.status(404).json({
                message: "Note not found"
            });
        }

        if (result.Item.userId !== userId) {
            return res.status(404).json({
                message: "Note not found"
            });
        }


        /*
        -------------------------------------------------
        Create user-specific S3 key.
        -------------------------------------------------
        */

        const fileKey =
            `users/${userId}/notes/${noteId}/${crypto.randomUUID()}-${req.file.originalname}`;


        /*
        -------------------------------------------------
        Upload image to S3.
        -------------------------------------------------
        */

        const command = new PutObjectCommand({
            Bucket: BUCKET_NAME,

            Key: fileKey,

            Body: req.file.buffer,

            ContentType: req.file.mimetype
        });

        await s3Client.send(command);


        /*
        -------------------------------------------------
        Store image key in DynamoDB.
        -------------------------------------------------
        */

        const updateCommand = new UpdateCommand({
            TableName: TABLE_NAME,

            Key: {
                id: noteId
            },

            UpdateExpression:
                "SET imageKey = :imageKey, updatedAt = :updatedAt",

            ConditionExpression:
                "userId = :userId",

            ExpressionAttributeValues: {
                ":imageKey": fileKey,
                ":updatedAt": new Date().toISOString(),
                ":userId": userId
            },

            ReturnValues: "ALL_NEW"
        });

        await docClient.send(updateCommand);

        res.status(201).json({
            message: "Image uploaded",
            key: fileKey
        });

    } catch (error) {
        console.error(error);

        if (error.name === "ConditionalCheckFailedException") {
            return res.status(404).json({
                message: "Note not found"
            });
        }

        res.status(500).json({
            message: "Failed to upload image"
        });
    }
};


module.exports = {
    getAllNotes,
    getNote,
    createNote,
    updateNote,
    deleteNote,
    uploadImage
};