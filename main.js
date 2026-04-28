const clientId = "228615";
const clientSecret = "e9fc0f6460040aeb1e3b75290cc9593670151f6f";

let authCode, refreshCode, accessCode, accessCodeExpiryDate;

const authenticate = () => {
    const thisPage = window.location.origin + window.location.pathname;
    window.location.href = "https://www.strava.com/oauth/authorize?" +
        "client_id=" + clientId + 
        "&response_type=code" + 
        "&redirect_uri=" + thisPage + 
        "&approval_prompt=force" + 
        "&scope=activity:read_all";
};

const clearCodes = () => {
    document.cookie = `accessCode=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
    document.cookie = `accessCodeExpiryDate=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
    document.cookie = `refreshCode=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
}

const saveCodes = () => {
    document.cookie = `accessCode=${accessCode}; expires=${accessCodeExpiryDate}`;
    document.cookie = `accessCodeExpiryDate=${accessCodeExpiryDate}; expires=${accessCodeExpiryDate.toString()}`;
    document.cookie = `refreshCode=${refreshCode}; expires=${new Date((new Date()).setMonth((new Date()).getMonth() + 2))}`;
};

const fetchActivities = () => {
    console.log("Log: Fetching activities");

    let xhr = new XMLHttpRequest();
        xhr.open("GET", "https://www.strava.com/api/v3/athlete/activities" +
            `?per_page=10`);
        xhr.setRequestHeader("Authorization", "Bearer " + accessCode);
        xhr.send();
    
        xhr.onreadystatechange = (e) => {
            if (xhr.readyState === 4) {
                try {
                    res = JSON.parse(xhr.responseText);
                    if (Array.isArray(res)) {
                        console.log(res);
                    } else {
                        console.log("Server error: " + res.message);
                    }
                } catch (_) {
                    console.log("Server error");
                }
            }
        };
};

const main = () => {
    let url = new URL(window.location.href);
    let cookies = document.cookie.split('; ').reduce((prev, current) => {
        const [name, ...value] = current.split('=');
        prev[name] = value.join('=');
        return prev;
    }, {});

    if (url.searchParams.has("code")) {
        authCode = url.searchParams.get("code");
    } 
    if ("accessCode" in cookies && Date.now() < new Date(cookies.accessCodeExpiryDate)) {
        accessCode = cookies.accessCode;
        accessCodeExpiryDate = new Date(cookies.accessCodeExpiryDate)
    } 
    if ("refreshCode" in cookies) {
        refreshCode = cookies.refreshCode;
    }
    if (!authCode && !accessCode & !refreshCode){
        authenticate();
    }

    if (accessCode) {
        console.log("Log: Using stored and valid AccessCode");

        fetchActivities();
    } else if (refreshCode) {
        console.log("Log: Using stored RefreshCode");

        let xhr = new XMLHttpRequest();
        xhr.open("POST", "https://www.strava.com/api/v3/oauth/token" +
            "?client_id=" + clientId + 
            "&client_secret=" + clientSecret +
            "&code=" + refreshCode +
            "&grant_type=refresh_token");
        xhr.send();

        let res;
        xhr.onreadystatechange = (e) => {
            if (xhr.readyState === 4) {
                res = JSON.parse(xhr.responseText);
                if (res.token_type && res.token_type === "Bearer") {
                    accessCode = res.access_token;
                    accessCodeExpiryDate = new Date(res.expires_at * 1000);
                    refreshCode = res.refresh_token;
                    saveCodes();

                    fetchActivities();
                } else {
                    console.log("Server error: " + res.message);
                    
                    clearCodes();
                    authenticate();
                }
            }
        };
    } else if (authCode) {
        console.log("Log: Using new AuthCode");

        let xhr = new XMLHttpRequest();
        xhr.open("POST", "https://www.strava.com/oauth/token" +
            "?client_id=" + clientId + 
            "&client_secret=" + clientSecret +
            "&code=" + authCode +
            "&grant_type=authorization_code");
        xhr.send();

        let res;
        xhr.onreadystatechange = (e) => {
            if (xhr.readyState === 4) {
                res = JSON.parse(xhr.responseText);
                console.log(res);
                if (res.token_type && res.token_type === "Bearer") {
                    accessCode = res.access_token;
                    accessCodeExpiryDate = new Date(res.expires_at * 1000);
                    refreshCode = res.refresh_token;
                    saveCodes();

                    fetchActivities();
                } else {
                    console.log("Server error: " + res.message);
                    
                    clearCodes();
                    authenticate();
                }
            }
        };
    }
}

main();