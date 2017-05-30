'use strict';

//##################################################################################
// on Windows please install: https://www.imagemagick.org/script/binary-releases.php
//
//on linux install: sudo apt-get imagemagick 
//##################################################################################


var azure = require('azure-storage');
var watermark = require('text-watermark');

var blobStorage = process.env.BLOBSTORAGE;
var blobKey = process.env.BLOBKEY;
var container = process.env.BLOBCONTAINER;
var inputBlob = process.env.INPUTBLOB;
var outputBlob = process.env.OUTPUTBLOB;
var tmpFile = "img.jpg";
var tmpOutFile = "outimg.jpg";

console.log('### start processing file: ' + inputBlob);

var blobSvc = azure.createBlobService(blobStorage, blobKey);
var fs = require('fs');
blobSvc.getBlobToStream(container, inputBlob, fs.createWriteStream(tmpFile), function (error, result, response) {
    if (!error) {
        // blob retrieved
        console.log('### blob retrieved: ' + inputBlob);

        //image processing
        var options = {
            'text': 'Azure Batch!',
            'color': 'rgba(255,255,0,0.5)',
            'outputPath': tmpOutFile
        };

        watermark.addWatermark(tmpFile, options, function (err) {
            if (err)
                return console.log(err);

            console.log("### blob converted ...");

            // upload image to server
            blobSvc.createBlockBlobFromLocalFile(container, outputBlob, tmpOutFile, function (err, result, response) {
                if (err) {
                    return console.log(err);
                }else{
                    // file uploaded
                    //delete temporary file
                    fs.unlink(tmpFile);
                    fs.unlink(tmpOutFile);
                    return console.log("### blob uploaded: " + outputBlob);
                }
            });

        });

    }
});

