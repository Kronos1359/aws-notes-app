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

const docClient = require("../services/dynamodb");

const { PutObjectCommand } = require("@aws-sdk/client-s3");

const s3Client = require("../services/s3");

const TABLE_NAME = "Notes";

const getAllNotes = async (req, res) => {
    try {
        const command = new ScanCommand({
            TableName: TABLE_NAME
        });

        const result = await docClient.send(command);

        const notes = result.Items || [];

        // Sort newest notes first
        notes.sort((a, b) =>
            new Date(b.createdAt) - new Date(a.createdAt)
        );

        for (const note of notes) {
            if (note.imageKey) {
                const imageCommand = new GetObjectCommand({
                    Bucket: "aws-notes-app-images-474939504380",
                    Key: note.imageKey
                });

                note.imageUrl = await getSignedUrl(
                    s3Client,
                    imageCommand,
                    { expiresIn: 3600 }
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

const getNote = async (req, res) => {
    try {
        const id = req.params.id;

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

        if (note.imageKey) {
            const imageCommand = new GetObjectCommand({
                Bucket: "aws-notes-app-images-474939504380",
                Key: note.imageKey
            });

            note.imageUrl = await getSignedUrl(
                s3Client,
                imageCommand,
                { expiresIn: 3600 }
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

const createNote = async (req, res) => {
    try {
        const { title, content } = req.body;

        const id = crypto.randomUUID();

        const note = {
            id,
            title,
            content,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
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

const updateNote = async (req, res) => {
    try {
        const id = req.params.id;
        const { title, content } = req.body;

        const command = new UpdateCommand({
            TableName: TABLE_NAME,
            Key: {
                id
            },
            UpdateExpression: "SET title = :title, content = :content, updatedAt = :updatedAt",
            ExpressionAttributeValues: {
                ":title": title,
                ":content": content,
                ":updatedAt": new Date().toISOString()
            },
            ReturnValues: "ALL_NEW"
        });

        const result = await docClient.send(command);

        res.json(result.Attributes);
    } catch (error) {
        console.error(error);

        res.status(500).json({
            message: "Failed to update note"
        });
    }
};

const deleteNote = async (req, res) => {
    try {
        const id = req.params.id;

        const command = new DeleteCommand({
            TableName: TABLE_NAME,
            Key: {
                id
            }
        });

        await docClient.send(command);

        res.json({
            message: "Note deleted"
        });
    } catch (error) {
        console.error(error);

        res.status(500).json({
            message: "Failed to delete note"
        });
    }
};

const uploadImage = async (req, res) => {
    try {
        const noteId = req.params.id;

        if (!req.file) {
            return res.status(400).json({
                message: "No image uploaded"
            });
        }

        const fileKey = `notes/${noteId}/${crypto.randomUUID()}-${req.file.originalname}`;

        const command = new PutObjectCommand({
            Bucket: "aws-notes-app-images-474939504380",
            Key: fileKey,
            Body: req.file.buffer,
            ContentType: req.file.mimetype
        });

        await s3Client.send(command);

        const updateCommand = new UpdateCommand({
            TableName: TABLE_NAME,
            Key: {
                id: noteId
            },
            UpdateExpression: "SET imageKey = :imageKey, updatedAt = :updatedAt",
            ExpressionAttributeValues: {
                ":imageKey": fileKey,
                ":updatedAt": new Date().toISOString()
            },
            ReturnValues: "ALL_NEW"
        });

        const result = await docClient.send(updateCommand);

        res.status(201).json({
            message: "Image uploaded",
            key: fileKey
        });
    } catch (error) {
        console.error(error);

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