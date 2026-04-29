const clientId = "228615";
const clientSecret = "e9fc0f6460040aeb1e3b75290cc9593670151f6f";

const potentialStreams = ["heartrate", "cadence", "velocity_smooth"];

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
};

const saveCodes = () => {
    document.cookie = `accessCode=${accessCode}; expires=${accessCodeExpiryDate}`;
    document.cookie = `accessCodeExpiryDate=${accessCodeExpiryDate}; expires=${accessCodeExpiryDate.toString()}`;
    document.cookie = `refreshCode=${refreshCode}; expires=${new Date((new Date()).setMonth((new Date()).getMonth() + 2))}`;
};

const distance = (data, attributes, index, centroid) => {
    return Math.sqrt(d3.sum(attributes, a => Math.pow(data[a].data[index] - centroid[a], 2)));
};

const kmeans = (data, attributes) => {
    const numPoints = data[attributes[0]].data.length;

    let centroids = [0, Math.floor(numPoints / 3), Math.floor(2 * numPoints / 3)].map(i => {
        const centroid = {};
        attributes.forEach(a => centroid[a] = data[a].data[i]);
        return centroid;
    });
    let converged = false;
    let clusters;

    while (!converged) {
        clusters = [[], [], []];

        for (let i = 0; i < numPoints; i++) {
            const point = { index: i };
            attributes.forEach(a => point[a] = data[a].data[i]);

            let closestIndex = 0;
            let minDistance = distance(data, attributes, i, centroids[0]);

            centroids.forEach((c, j) => {
                const newDistance = distance(data, attributes, i, c);
                if (newDistance < minDistance) {
                    closestIndex = j;
                    minDistance = newDistance;
                }
            });

            clusters[closestIndex].push(point);
        };

        const newCentroids = [];
        clusters.forEach(cluster => {
            newCentroid = {};
            attributes.forEach(a => newCentroid[a] = 0);
            cluster.forEach(p => {
                attributes.forEach(a => newCentroid[a] += p[a]);
            });
            attributes.forEach(a => newCentroid[a] = newCentroid[a] / cluster.length);
            newCentroids.push(newCentroid);
        });

        const centroidsString = centroids.map(c => {
            let centroidString = "";
            attributes.forEach(a => centroidString += "," + c[a]);
            return centroidString;
        }).join(";");

        const newCentroidsString = newCentroids.map(c => {
            let centroidString = "";
            attributes.forEach(a => centroidString += "," + c[a]);
            return centroidString;
        }).join(";");
        
        if (centroidsString === newCentroidsString) {
            converged = true;
        } else {
            centroids = newCentroids;
        }
    }

    return clusters;
};

const visualizeActivityStream = (data, startDateTime, duration) => {
    const streams = potentialStreams.filter(s => s in data);

    streams.forEach(s => {
        let min = Infinity;
        let max = -Infinity;
        data[s].data.forEach(d => {
            if (d < min) min = d;
            if (d > max) max = d;
        });

        data[s].data = data[s].data.map(d => (d - min) / (max - min));
    });

    const clusters = kmeans(data, streams);
    let values = [];
    clusters.forEach((cluster, i) => {
        newCentroid = {};
        streams.forEach(a => newCentroid[a] = 0);
        cluster.forEach(p => {
            streams.forEach(a => newCentroid[a] += p[a]);
        });
        streams.forEach(a => newCentroid[a] = newCentroid[a] / cluster.length);
        values.push({ index: i, value: Math.sqrt(d3.sum(streams, a => Math.pow(newCentroid[a], 2)))});
    });
    values.sort((a, b) => a.value - b.value);
    values = [
        {
            index: values[0].index,
            value: "low"
        },
        {
            index: values[1].index,
            value: "medium"
        },
        {
            index: values[2].index,
            value: "high"
        }
    ];

    const indexToValue = {};
    values.forEach(value => {
        indexToValue[value.index] = value.value;
    });
    
    const flow = [];
    clusters.forEach((cluster, i) => {
        flow.push(...cluster.map(p => { return { index: p.index, value: indexToValue[i] } }));
    });
    flow.sort((a, b) => a.index - b.index);

    const width = document.getElementById("visualization").clientWidth;
    const angleStep = 2 * Math.PI * (duration / flow.length) / 60;
    const start = new Date(startDateTime);
    const startTime = start.getMinutes() + (start.getSeconds() / 60) + (start.getMilliseconds() / 1000);
    const startAngle = 2 * Math.PI * startTime / 60; 
    const radiusStep = duration > 60 ? width * 0.06 : 0;
    const svg = d3.select("#visualization")
        .attr("viewBox", `0 0 ${width} ${width}`)
        .attr("xmlns", "http://www.w3.org/2000/svg")
        .attr("xmlns:xlink", "http://www.w3.org/1999/xlink");

    const colourMap = {
        "low": "#aaaaaa",
        "medium": "#555555",
        "high": "#000000"
    };
    const thicknessMap = {
        "low": 0.01,
        "medium": 0.02,
        "high": 0.03
    };
    
    svg.selectAll("path")
        .data(flow)
        .join("path")
        .attr("transform", `translate(${width / 2}, ${width / 2})`)
        .attr("fill", d => colourMap[d.value])
        .attr("d", d => {
            const angle = startAngle + d.index * angleStep;
            const halfThickness = thicknessMap[d.value] / 2;
            return d3.arc()({
                innerRadius: width * (0.45 - halfThickness) - radiusStep * ((angle - startAngle) / (2 * Math.PI)),
                outerRadius: width * (0.45 + halfThickness) - radiusStep * ((angle - startAngle) / (2 * Math.PI)),
                startAngle: angle,
                endAngle: angle + angleStep
            });
        });
};

const downloadSvg = () => {
    const svgData = $("#visualization")[0].outerHTML;
    const svgBlob = new Blob([svgData], {type:"image/svg+xml;charset=utf-8"});
    const svgUrl = URL.createObjectURL(svgBlob);
    const downloadLink = document.createElement("a");
    downloadLink.href = svgUrl;
    downloadLink.download = "activity.svg";
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
};

const fetchActivityStream = (activity) => {
    d3.select("#activity-container").style("display", "none");
    d3.select("#visualization-container").style("display", "block");
    
    d3.select("#visualization > *").remove();

    let xhr = new XMLHttpRequest();
    xhr.open("GET", `https://www.strava.com/api/v3/activities/${activity.id}/streams` +
        `?keys=[${potentialStreams.join(",")}]&key_by_type=true`);
    xhr.setRequestHeader("Authorization", "Bearer " + accessCode);
    xhr.send();

    xhr.onreadystatechange = (e) => {
        if (xhr.readyState === 4) {
            res = JSON.parse(xhr.responseText);
            if ("heartrate" in res) {
                visualizeActivityStream(res, activity.start_date, activity.elapsed_time / 60);
            } else {
                console.log("Server error: " + res.message);
            }
        }
    };
};

const populateActivities = (activities) => {
    d3.select("#activity-container").style("display", "block");
    d3.select("#visualization-container").style("display", "none");
    d3.select("#activities > *").remove();
    const buttons = d3.selectAll("#activities").selectAll("div")
        .data(activities)
        .join("div")
        .attr("class", "button")
        .on("click", (_, d) => fetchActivityStream(d));

    buttons.selectAll("p.sport")
        .data(d => [d])
        .join("p")
        .attr("class", "sport")
        .text(d => d.sport_type);

    buttons.selectAll("p.name")
        .data(d => [d])
        .join("p")
        .attr("class", "name")
        .text(d => d.name);

    buttons.selectAll("p.date")
        .data(d => [d])
        .join("p")
        .attr("class", "date")
        .text(d => {
            const date = new Date(d.start_date);
            return date.toLocaleString('default', { month: 'long' }) + " " + date.getDate() + ", " + date.getFullYear() +
                " - " + date.getHours() + ":" + String(date.getMinutes()).padStart(2, "0");
        });

    d3.select("#activity-container").attr("style", "block");
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
                    populateActivities(res);
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
    d3.selectAll("#back-button").on("click", fetchActivities);
    d3.selectAll("#download-button").on("click", downloadSvg);

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
};

main();