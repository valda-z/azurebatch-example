'use strict';

//########################################################################################
// prepare VM pool with start task command (run under Task autouser, Admin): 
//       sudo apt-get -y install npm nodejs imagemagick nodejs-legacy
//########################################################################################

var azure = require('azure-storage');
var batch = require('azure-batch');

// Initializing Azure Batch variables
var accountName = process.env.ACCOUNTNAME;
var accountKey = process.env.ACCOUNTKEY;
var accountUrl = process.env.ACCOUNTURL;
var poolId = process.env.POOLID;

var blobStorage = process.env.BLOBSTORAGE;
var blobKey = process.env.BLOBKEY;
var container = process.env.BLOBCONTAINER;
var inputFolder = process.env.INPUTFOLDER;
var outputFolder = process.env.OUTPUTFOLDER;

function formatDate() {
    var now = new Date();
    var then = now.getFullYear() + "_" + (now.getMonth() + 1) + "_"  + now.getDay();
    then += 'T' + now.getHours() + "_" + now.getMinutes() + "_"  + now.getSeconds();
    return then;
} 

// Create Batch credentials object using account name and account key
var credentials = new batch.SharedKeyCredentials(accountName, accountKey);

console.log('>> Connecting to batch service ...');

// Create Batch service client
var batch_client = new batch.ServiceClient(credentials, accountUrl);


var job_prep_task_config = {
    id: 'installprereq',
    commandLine: 'npm install',
    resourceFiles: [
        { 'blobSource': 'https://raw.githubusercontent.com/valda-z/azurebatch-example/master/AzBatchAgent/app.js', 'filePath': 'app.js' },
        { 'blobSource': 'https://raw.githubusercontent.com/valda-z/azurebatch-example/master/AzBatchAgent/package.json', 'filePath': 'package.json' }
    ],
    waitForSuccess: true,
    runElevated: true
}

console.log('>> Creating batch pool job ...');

var startTime = new Date().getTime();
var tasksDone = false;

function getTasks(myJobId) {
    batch_client.task.list(myJobId, function (error, result) {
        var _tAll = 0;
        var _tSucc = 0;
        var _tRunn = 0;
        var _tErr = 0;
        var _tDone = 0;
        var _tWait = 0;
        result.forEach(function (entry) {
            _tAll++;
            if (entry.executionInfo.exitCode === undefined) {
                if (entry.state == "running") {
                    _tRunn++;
                } else {
                    _tWait++;
                }
            } else {
                _tDone++;
                if (entry.executionInfo.exitCode == "0") {
                    _tSucc++;
                } else {
                    _tErr++;
                }
            }
            //console.log(entry.id + " .. " + entry.state + " ... " + entry.executionInfo.endTime);
            //console.log(entry);
        });
        console.log("Tasks / Done (success, error) / Running / Waiting : " +
            _tAll + " / " +
            _tDone + " ( " + _tSucc + " , " + _tErr + " ) / " +
            _tRunn + " / " +
            _tWait + " .... " + (((_tDone * 1.0) / (_tAll * 1.0)) * 100.0).toFixed(2) + "%  (" +
            (((new Date().getTime()) - startTime) / 1000.0).toFixed(2) + " sec. exec time)");
        if (_tAll == _tDone) {
            console.log("----------------------------------------------------");
            console.log(">> DONE in " + (((new Date().getTime()) - startTime) / 1000.0).toFixed(2) + " sec.");
            console.log("----------------------------------------------------");
            tasksDone = true;
            return true;
        } else {
            setTimeout(getTasks, 1000, myJobId);
            return false;
        }
    });
}

// Setting up Batch pool configuration
var pool_config = { poolId: poolId }
// Setting up Job configuration along with preparation task
var jobId = "imgprocess_" + formatDate();
var job_config = { id: jobId, displayName: "process images", jobPreparationTask: job_prep_task_config, poolInfo: pool_config }
// Adding Azure batch job to the pool
var job = batch_client.job.add(job_config, function (error, result) {
    if (error != null) {
        console.log("## Error submitting job : " + error.response);
    }
    console.log('>> Job created.');

    console.log('>> Start processing ...');

    var blobSvc = azure.createBlobService(blobStorage, blobKey);

    blobSvc.listBlobsSegmentedWithPrefix(container, inputFolder + "/", null, function (error, result, response) {
        if (!error) {
            // result.entries contains the entries
            // If not all blobs were returned, result.continuationToken has the continuation token.
            var i = 0;
            result.entries.forEach(function (entry) {

                i++;
                var blobName = entry.name;

                var cmdVariables = [
                    { 'name': 'BLOBKEY', 'value': blobKey },
                    { 'name': 'BLOBSTORAGE', 'value': blobStorage },
                    { 'name': 'BLOBCONTAINER', 'value': container },
                    { 'name': 'INPUTBLOB', 'value': blobName },
                    { 'name': 'OUTPUTBLOB', 'value': outputFolder + blobName.substr(inputFolder.length) }
                    ]
                var cmdLine = '/bin/sh -c  "node ../../installprereq/wd/app.js"';

                var taskID = i + "_process";
                var task_config = {
                    id: taskID, displayName: 'process image ' + blobName,
                    commandLine: cmdLine,
                    environmentSettings: cmdVariables
                }
                console.log(">> Creating task for blob : " + blobName);
                var task = batch_client.task.add(jobId, task_config, function (error, result) {
                    if (error != null) {
                        console.log(error.response);
                    }
                    else {
                        console.log(">> Task for blob : " + blobName + " submitted successfully");
                    }
                    
                });
            });

            //start monitoring
            console.log(">> Start tasks monitoring for job: " + jobId);

            getTasks(jobId);
        }
    });

});



