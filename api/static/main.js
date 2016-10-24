// Get the modal
var modal = document.getElementById('myModal');

var currentFunction = null;

window.onclick = function (e) {
    var responseDiv = document.getElementById("responseTextArea");
    var usernameInput = document.getElementById("username");
    var passwordInput = document.getElementById("password");
    var authenticationModeDiv = document.getElementById("authenticationMode");

    if (e.target.localName == 'a') {
        modal.style.display = "block";
        currentFunction = e.target.innerHTML;
        document.getElementById("runTitle").innerHTML = "اجرای تابع " + e.target.innerHTML;
        responseDiv.value = "";
    } else if (event.target == modal) {
        modal.style.display = "none";
    } else if (e.target.id == "authenticationMode") {
        if (e.target.value == "client") {
            usernameInput.disabled = "";
            passwordInput.disabled = "";
        } else {
            usernameInput.disabled = "disabled";
            passwordInput.disabled = "disabled";
        }
    } else if (e.target.id == "runButton" || e.target.id == "runButton2"){
        var requestBody = document.getElementById("requestBody").value;
        console.log("run " + currentFunction);
        console.log(requestBody);
        responseDiv.value = "Requesting to local server...\n";

        var xhr = new XMLHttpRequest();

        var xhr0 = new XMLHttpRequest();
        xhr0.addEventListener("readystatechange", function () {
            if (this.readyState === 4) {
                if (this.status == 200) {
                    var accessToken = JSON.parse(this.responseText)['access_token'];
                    xhr.open("POST", "/" + currentFunction + "?showLogs=true");
                    xhr.setRequestHeader("Authorization", "Bearer " + accessToken);
                    xhr.setRequestHeader("Content-Type", "application/json");
                    xhr.send(requestBody);
                } else {
                    responseDiv.value = "Error getting access token ... \n";
                    responseDiv.value += JSON.stringify(JSON.parse(this.responseText), null, 4);
                }
            }
        });
        xhr0.open("POST", "http://api.backtory.com/auth/login");
        xhr0.setRequestHeader("X-Backtory-Authentication-Id", window.backtoryAuthenticationId);
        if (authenticationModeDiv.value=="master") {
            xhr0.setRequestHeader("X-Backtory-Authentication-Key", window.backtoryMasterKey);
            xhr0.send();
        } else if (authenticationModeDiv.value=="client"){
            xhr0.setRequestHeader("X-Backtory-Authentication-Key", window.backtoryClientKey);
            //xhr0.setRequestHeader("Content-Type", "multipart/form-data");
            //xhr0.withCredentials = true;
            var data = new FormData();
            data.append("username", usernameInput.value);
            data.append("password", passwordInput.value);
            xhr0.send(data);
        } else {
            xhr.open("POST", "/" + currentFunction + "?showLogs=true");
            xhr.setRequestHeader("Content-Type", "application/json");
            xhr.send(requestBody);
        }

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
