// Get the modal
var modal = document.getElementById('myModal');

var currentFunction = null;

window.onclick = function (e) {
    var responseDiv = document.getElementById("responseTextArea");

    if (e.target.localName == 'a') {
        modal.style.display = "block";
        currentFunction = e.target.innerHTML;
        document.getElementById("runTitle").innerHTML = "اجرای تابع " + e.target.innerHTML;
        responseDiv.value = "";
    } else if (event.target == modal) {
        modal.style.display = "none";
    } else if (e.target.id == "runButton"){
        var requestBody = document.getElementById("requestBody").value;
        console.log("run " + currentFunction);
        console.log(requestBody);
        responseDiv.value = "Requesting to local server...\n";


        var xhr0 = new XMLHttpRequest();
        xhr0.addEventListener("readystatechange", function () {
            if (this.readyState === 4) {
                if (this.status == 200) {
                    var accessToken = JSON.parse(this.responseText)['access_token'];
                    xhr.open("POST", "/" + currentFunction + "?showLogs=true");
                    xhr.setRequestHeader("Content-Type", "application/json");
                    xhr.setRequestHeader("Authorization", "Bearer " + accessToken);
                    xhr.send(requestBody);
                } else {
                    responseDiv.value = "Error getting access token ... \n";
                    responseDiv.value += JSON.stringify(JSON.parse(this.responseText), null, 4);
                }
            }
        });
        xhr0.open("POST", "http://api.backtory.com/auth/login");
        xhr0.setRequestHeader("Content-Type", "application/json");
        xhr0.setRequestHeader("X-Backtory-Authentication-Id", window.backtoryAuthenticationId);
        xhr0.setRequestHeader("X-Backtory-Authentication-Key", window.backtoryMasterKey);
        xhr0.send(requestBody);

        var xhr = new XMLHttpRequest();
        xhr.addEventListener("readystatechange", function () {
            if (this.readyState === 4) {
                var t = this.responseText;
                try {
                    t = JSON.parse(t);
                } catch (e) {}
                var result = {
                    "response status": this.status,
                    "response body": t.response,
                    "logs": t.logs
                };
                if (this.status != 200) {
                    responseDiv.value += "Run FAILED: \n";
                    if (this.status == 401) {
                        result = {
                            "response status": this.status,
                            "response body": t
                        };
                    }
                } else {
                    responseDiv.value += "Run SUCCEEDED: \n";
                }
                responseDiv.value += JSON.stringify(result, null, 4);
            }
        });


    }
};
