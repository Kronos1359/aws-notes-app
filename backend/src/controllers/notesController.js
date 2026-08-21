const crypto = require("crypto");

const {
    PutCommand,
    ScanCommand,
    GetCommand,
    UpdateCommand,
    DeleteCommand
} = require("@aws-sdk/lib-dynamodb");

const {
    GetObjectCommand,
    PutObjectCommand,
    DeleteObjectCommand
} = require("@aws-sdk/client-s3");

const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

const docClient = require("../services/dynamodb");
const s3Client = require("../services/s3");

const TABLE_NAME = "Notes";
const BUCKET_NAME = "aws-notes-app-images-474939504380";


/*
=========================================================
HELPER: GET IMAGE KEYS

Supports both:
- old notes using imageKey
- new notes using imageKeys[]
=========================================================
*/

function getImageKeys(note) {
    if (Array.isArray(note.imageKeys)) {
        return note.imageKeys;
    }

    if (note.imageKey) {
        return [note.imageKey];
    }

    return [];
}


/*
=========================================================
HELPER: ADD SIGNED IMAGE URLS
=========================================================
*/

async function addImageUrls(note) {
    const keys = getImageKeys(note);

    const images = [];

    for (const key of keys) {
        const command = new GetObjectCommand({
            Bucket: BUCKET_NAME,
            Key: key
        });

        const url = await getSignedUrl(
            s3Client,
            command,
            {
                expiresIn: 3600
            }
        );

        images.push({
            key,
            url
        });
    }

    note.images = images;

    // Backwards compatibility for the current frontend
    if (images.length > 0) {
        note.imageUrl = images[0].url;
    }

    return note;
}


/*
=========================================================
GET ALL NOTES
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

        notes.sort(
            (a, b) =>
                new Date(b.createdAt) - new Date(a.createdAt)
        );

        for (const note of notes) {
            await addImageUrls(note);
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

        if (note.userId !== userId) {
            return res.status(404).json({
                message: "Note not found"
            });
        }

        await addImageUrls(note);

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
            updatedAt: now,

            // New notes start with an empty image array
            imageKeys: []
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

        await addImageUrls(result.Attributes);

        res.json(result.Attributes);

    } catch (error) {
        console.error(error);

        if (
            error.name ===
            "ConditionalCheckFailedException"
        ) {
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

Also removes all associated S3 images.
=========================================================
*/

const deleteNote = async (req, res) => {
    try {
        const id = req.params.id;

        const userId = req.user.sub;


        // First get the note
        const getCommand = new GetCommand({
            TableName: TABLE_NAME,

            Key: {
                id
            }
        });

        const result = await docClient.send(getCommand);

        if (!result.Item) {
            return res.status(404).json({
                message: "Note not found"
            });
        }

        const note = result.Item;

        if (note.userId !== userId) {
            return res.status(404).json({
                message: "Note not found"
            });
        }


        // Delete all images belonging to this note
        const imageKeys = getImageKeys(note);

        for (const key of imageKeys) {
            try {
                await s3Client.send(
                    new DeleteObjectCommand({
                        Bucket: BUCKET_NAME,
                        Key: key
                    })
                );
            } catch (imageError) {
                console.error(
                    "Failed to delete S3 image:",
                    key,
                    imageError
                );
            }
        }


        // Delete DynamoDB note
        const deleteCommand = new DeleteCommand({
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

        await docClient.send(deleteCommand);

        res.json({
            message: "Note deleted"
        });

    } catch (error) {
        console.error(error);

        if (
            error.name ===
            "ConditionalCheckFailedException"
        ) {
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

Supports multiple images.

Each upload appends to imageKeys[]
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


        // Verify note ownership
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


        // Create S3 key
        const fileKey =
            `users/${userId}/notes/${noteId}/${crypto.randomUUID()}-${req.file.originalname}`;


        // Upload to S3
        const command = new PutObjectCommand({
            Bucket: BUCKET_NAME,

            Key: fileKey,

            Body: req.file.buffer,

            ContentType: req.file.mimetype
        });

        await s3Client.send(command);


        // Add the image key to the existing array
        const existingKeys =
            getImageKeys(result.Item);

        const newImageKeys = [
            ...existingKeys,
            fileKey
        ];


        const updateCommand = new UpdateCommand({
            TableName: TABLE_NAME,

            Key: {
                id: noteId
            },

            UpdateExpression:
                "SET imageKeys = :imageKeys, updatedAt = :updatedAt",

            ConditionExpression:
                "userId = :userId",

            ExpressionAttributeValues: {
                ":imageKeys": newImageKeys,

                ":updatedAt":
                    new Date().toISOString(),

                ":userId": userId
            },

            ReturnValues: "ALL_NEW"
        });

        const updated =
            await docClient.send(updateCommand);

        res.status(201).json({
            message: "Image uploaded",

            key: fileKey,

            note: updated.Attributes
        });

    } catch (error) {
        console.error(error);

        if (
            error.name ===
            "ConditionalCheckFailedException"
        ) {
            return res.status(404).json({
                message: "Note not found"
            });
        }

        res.status(500).json({
            message: "Failed to upload image"
        });
    }
};


/*
=========================================================
DELETE ONE IMAGE
=========================================================
*/

const deleteImage = async (req, res) => {
    try {
        const noteId = req.params.id;

        const { imageKey } = req.body;

        const userId = req.user.sub;


        // Get note
        const getCommand = new GetCommand({
            TableName: TABLE_NAME,

            Key: {
                id: noteId
            }
        });

        const result =
            await docClient.send(getCommand);

        if (!result.Item) {
            return res.status(404).json({
                message: "Note not found"
            });
        }

        const note = result.Item;

        if (note.userId !== userId) {
            return res.status(404).json({
                message: "Note not found"
            });
        }


        const existingKeys =
            getImageKeys(note);

        if (!existingKeys.includes(imageKey)) {
            return res.status(404).json({
                message: "Image not found"
            });
        }


        // Delete S3 object
        await s3Client.send(
            new DeleteObjectCommand({
                Bucket: BUCKET_NAME,
                Key: imageKey
            })
        );


        // Remove key from DynamoDB array
        const remainingKeys =
            existingKeys.filter(
                key => key !== imageKey
            );


        const updateCommand = new UpdateCommand({
            TableName: TABLE_NAME,

            Key: {
                id: noteId
            },

            UpdateExpression:
                "SET imageKeys = :imageKeys, updatedAt = :updatedAt",

            ConditionExpression:
                "userId = :userId",

            ExpressionAttributeValues: {
                ":imageKeys": remainingKeys,

                ":updatedAt":
                    new Date().toISOString(),

                ":userId": userId
            },

            ReturnValues: "ALL_NEW"
        });

        await docClient.send(updateCommand);

        res.json({
            message: "Image deleted"
        });

    } catch (error) {
        console.error(error);

        res.status(500).json({
            message: "Failed to delete image"
        });
    }
};


module.exports = {
    getAllNotes,
    getNote,
    createNote,
    updateNote,
    deleteNote,
    uploadImage,
    deleteImage
};