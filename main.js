const clientId = "228615";
const clientSecret = "e9fc0f6460040aeb1e3b75290cc9593670151f6f";

const intensityStreams = ["heartrate", "cadence", "velocity_smooth"];
const otherStreams = ["latlng", "time"];

let authCode, refreshCode, accessCode, accessCodeExpiryDate;

let page = 1;
let activities = [];
let settings = "s__h__t";

let savedActivity;
let savedStream;
let savedFlow;

const getSetting = (setting) => {
    let value = "";
    const options = $(`input[name="${setting}"]`);
    for (let i = 0; i < options.length; i++) {
        if (options[i].checked === true) {
            value += options[i].value[0];
        }
    }
    return value;
};

const updateSettings = () => {
    const newSettings = ["colour_scheme", "metrics", "map", "time", "background"].map(getSetting);
    settings = newSettings.join("_");
    document.cookie = `settings=${settings}; expires=${new Date((new Date()).setMonth((new Date()).getMonth() + 12))}`;
    visualizeActivityStream(savedFlow);
};

const setupSetting = (setting, selection) => {
    const options = $(`input[name="${setting}"]`);
    for (let i = 0; i < options.length; i++) {
        if (selection.includes(options[i].value[0])) {
            options[i].checked = true;
        }
    }
};

const setupSettings = () => {
    let [colours, metrics, map, times, background] = settings.split("_");

    [colours, map, background].forEach(list => {
        list = list[0];
    });

    [
        ["colour_scheme", colours],
        ["metrics", metrics], 
        ["map", map], 
        ["time", times], 
        ["background", background]
    ].forEach(([setting, selection]) => setupSetting(setting, selection));
};

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
    document.cookie = `accessCode=; expires=Thu, 01 Jan 1970 00:00:00 UTC;`;
    document.cookie = `accessCodeExpiryDate=; expires=Thu, 01 Jan 1970 00:00:00 UTC;`;
    document.cookie = `refreshCode=; expires=Thu, 01 Jan 1970 00:00:00 UTC;`;
};

const saveCodes = () => {
    document.cookie = `accessCode=${accessCode}; expires=${accessCodeExpiryDate}`;
    document.cookie = `accessCodeExpiryDate=${accessCodeExpiryDate}; expires=${accessCodeExpiryDate.toString()}`;
    document.cookie = `refreshCode=${refreshCode}; expires=${new Date((new Date()).setMonth((new Date()).getMonth() + 2))}`;
};

const distance = (data, attributes, index, centroid) => {
    return Math.sqrt(d3.sum(attributes, a => Math.pow(data[a].data[index] - centroid[a], 2)));
};

const kmeans = (data, attributes, saveAttributes) => {
    const numPoints = data[attributes[0]].data.length;

    let centroids = [0, Math.floor(numPoints / 3), Math.floor(2 * numPoints / 3)].map(i => {
        const centroid = {};
        attributes.forEach(a => centroid[a] = data[a].data[i]);
        return centroid;
    });
    let converged = false;
    let clusters;
    let iterations = 100;

    while (!converged && iterations > 0) {
        clusters = [[], [], []];

        for (let i = 0; i < numPoints; i++) {
            const point = { index: i };
            attributes.forEach(a => point[a] = data[a].data[i]);
            otherStreams.filter(s => s in data).forEach(a => point[a] = data[a].data[i]);

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

        iterations--;
    }

    return clusters;
};

const visualizeActivityStream = (flow) => {
    d3.selectAll("#visualization > *").remove();

    const [colours, metrics, map, times, background] = settings.split("_");

    const threshold = 4 * 3600;
    const meetsThreshold = savedActivity.elapsed_time > threshold;

    const width = document.getElementById("visualization").clientWidth;
    const angleStep = 2 * Math.PI / (60 * 60 * (meetsThreshold ? 12 : 1));
    const start = new Date(savedActivity.start_date);
    const startTime = (meetsThreshold ? 60 * start.getHours() : 0) + (start.getMinutes() + (start.getSeconds() / 60));
    const startAngle = 2 * Math.PI * startTime / (60 * (meetsThreshold ? 12 : 1)); 
    const radiusStep = (flow[flow.length - 1].time / 60) > (meetsThreshold ? 720 : 55) ? width * 0.05 : 0;
    const svg = d3.select("#visualization")
        .attr("viewBox", `0 0 ${width} ${width}`)
        .attr("xmlns", "http://www.w3.org/2000/svg")
        .attr("xmlns:xlink", "http://www.w3.org/1999/xlink");

    svg.append("defs")
        .append('style')
        .attr("type", "text/css")
        .text(`@font-face { font-family: 'Custom Font'; src: url('${font}'); }`);

    const colourMaps = {
        s: {
            "low": "#fcccb8",
            "medium": "#fca079",
            "high": "#FC4C02"
        },
        g: {
            "low": "#aaaaaa",
            "medium": "#555555",
            "high": "#000000"
        },
        t: {
            "low": "#33a02c",
            "medium": "#F1D302",
            "high": "#F8333C"
        }
    };

    if (background === "w") {
        svg.append("rect")
            .attr("width", width)
            .attr("height", width)
            .attr("rx", width / 10)
            .attr("ry", width / 10)
            .attr("fill", "white");
    }

    if (map === "s" && "latlng" in flow[0]) {
        const mapX = d => d.latlng[0];
        const mapY = d => d.latlng[1];

        const xExtent = d3.extent(flow, mapX);
        const yExtent = d3.extent(flow, mapY);

        const centerX = (xExtent[1] + xExtent[0]) / 2;
        const centerY = (yExtent[1] + yExtent[0]) / 2;
        const range = d3.max([xExtent[1] - xExtent[0], yExtent[1] - yExtent[0]]);

        const mapXScale = d3.scaleLinear().domain([centerX - range / 2, centerX + range / 2]).range([0, width / 3]);
        const mapYScale = d3.scaleLinear().domain([centerY - range / 2, centerY + range / 2]).range([0, width / 3]);
    
        svg.selectAll("path.map")
            .data([flow])
            .join("path")
            .attr("class", "map")
            .attr("stroke-opacity", metrics.length > 0 ? 0.25 : 1)
            .attr("stroke", colourMaps[colours]["high"])
            .attr("stroke-width", width / 100)
            .attr("fill", "none")
            .attr("d", d => {
                return d3.line()
                    .x(p => mapXScale(mapX(p)))
                    .y(p => mapYScale(mapY(p)))
                    (d);
            })
            .attr("transform", `translate(${width / 3}, ${ 2 * width / 3}) rotate(-90)`);
    }

    const thicknessMap = {
        "low": 0.01,
        "medium": 0.02,
        "high": 0.03
    };

    const dots = [];
    for (let i = 0; i < savedActivity.elapsed_time; i += 60 * (meetsThreshold ? 12 : 1)) {
        dots.push({ start: i, length: d3.min([30, savedActivity.elapsed_time - i]) });
    }
    
    svg.selectAll("path.duration")
        .data(dots)
        .join("path")
        .attr("class", "duration")
        .attr("transform", `translate(${width / 2}, ${width / 2})`)
        .attr("fill", "#888888")
        .attr("d", d => {
            const angle = startAngle + d.start * angleStep;
            const halfThickness = thicknessMap["low"] / 8;
            return d3.arc()({
                innerRadius: width * (0.39 - halfThickness) - radiusStep * ((angle - startAngle) / (2 * Math.PI)),
                outerRadius: width * (0.39 + halfThickness) - radiusStep * ((angle - startAngle) / (2 * Math.PI)),
                startAngle: angle,
                endAngle: angle + d.length * angleStep
            });
        });
    
    svg.selectAll("path.intensity")
        .data(flow)
        .join("path")
        .attr("class", "intensity")
        .attr("transform", `translate(${width / 2}, ${width / 2})`)
        .attr("fill", d => colourMaps[colours][d.value])
        .attr("d", d => {
            const angle = startAngle + d.time * angleStep;
            const halfThickness = thicknessMap[d.value] / 2;
            return d3.arc()({
                innerRadius: width * (0.39 - halfThickness) - radiusStep * ((angle - startAngle) / (2 * Math.PI)),
                outerRadius: width * (0.39 + halfThickness) - radiusStep * ((angle - startAngle) / (2 * Math.PI)),
                startAngle: angle,
                endAngle: angle + 1 * angleStep * ((d.timeStep > (5 * flow[flow.length - 1].time / flow.length) ? 1 : d.timeStep) + 1)
            });
        });

    if (times.length > 0) {
        let timeLabels = [];
        const defs = svg.append("defs");
        if (times.includes("s")) {
            const timeLabel = {
                label: start.getHours() + ":" + String(start.getMinutes()).padStart(2, "0"),
                angle: startAngle - Math.PI / 2 - Math.PI / 24,
                radius: width * 0.39,
            };
            timeLabel.angle -= ((1 + Math.cos(Math.PI * timeLabel.angle / (width / 2))) * Math.PI / 96) * (width * 0.39) / timeLabel.radius;

            timeLabels.push(timeLabel);
        }
        if (times.includes("e")) {
            const endDateTime = new Date(start.getTime() + flow[flow.length - 1].time * 1000);
            const angle = startAngle + flow[flow.length - 1].time * angleStep

            const timeLabel = {
                label: endDateTime.getHours() + ":" + String(endDateTime.getMinutes()).padStart(2, "0"),
                angle: angle - Math.PI / 2 + Math.PI / 24,
                radius: width * 0.39 - radiusStep * ((angle - startAngle) / (2 * Math.PI))
            };
            timeLabel.angle += ((1 + Math.cos(Math.PI * timeLabel.angle / (width / 2))) * Math.PI / 96) * (width * 0.39) / timeLabel.radius;

            timeLabels.push(timeLabel);
        }

        svg.selectAll(".time-text")
            .data(timeLabels)
            .join('text')
            .attr("transform", `translate(${width / 2}, ${width / 2})`)
            .attr("x", d => d.radius * Math.cos(d.angle))
            .attr("y", d => d.radius * Math.sin(d.angle))
            .attr('text-anchor', "middle")
            .attr("dominant-baseline", "middle")
            .text(d => d.label);
    }

    if (metrics.length > 0) {
        let chosenMetrics = [
            {
                name: "name",
                real: "name",
                map: d => d,
                weight: "bold"
            },
            {
                name: "sport",
                real: "sport_type",
                map: d => `Sport: ${d.replace(/([A-Z])/g, ' $1').trim()}`,
                weight: "normal"
            },
            {
                name: "distance",
                real: "distance",
                map: d => `${(d / 1000).toFixed(2)} km`,
                weight: "normal"
            },
            {
                name: "time",
                real: "moving_time",
                map: d => {
                    let movingTime = `${Math.floor((d % 3600) / 60)}m ${String(Math.round(d % 60)).padStart(2, "0")}s`;
                    if (d >= 3600) {
                        movingTime = `${Math.floor(d / 3600)}h ` + movingTime;
                    }
                    return movingTime;
                },
                weight: "normal"
            },
            { 
                name: "pace", 
                real: "average_speed",
                map: d => {
                    const spkm = 1000 / d;
                    return `${Math.floor(spkm / 60)}:${String(Math.round(spkm) % 60).padStart(2, "0")} min/km`;
                },
                weight: "normal"
            },
            {
                name: "heartrate",
                real: "average_heartrate",
                map: d => `Avg HR ${d} bpm`,
                weight: "normal"
            }]
            .filter(m => metrics.includes(m.name[0]))
            .filter(m => m.real in savedActivity && savedActivity[m.real] !== 0);

        svg.selectAll(".metric-text")
            .data(chosenMetrics)
            .join('text')
            .attr("class", "metric-text")
            .attr("transform", `translate(${width / 2}, ${width / 2})`)
            .attr("y", (_, i) => i * width / 12 - ((chosenMetrics.length - 1) * width / 24))
            .attr('text-anchor', "middle")
            .attr("dominant-baseline", "middle")
            .attr("font-weight", d => d.weight)
            .text(d => d.map(savedActivity[d.real]));
    }

    svg.selectAll("text")
        .attr("font-size", width / 25)
        .attr("font-family", "Custom Font");
};

const computeData = (data) => {
    const streams = intensityStreams.filter(s => s in data);

    streams.forEach(s => {
        let min = Infinity;
        let max = -Infinity;
        data[s].data.forEach(d => {
            if (d < min) min = d;
            if (d > max) max = d;
        });

        data[s].data = data[s].data.map(d => (d - min) / (max - min));
    });

    const clusters = kmeans(data, streams, otherStreams.filter(s => s in data));
    let values = [];
    clusters.forEach((cluster, i) => {
        newCentroid = {};
        streams.forEach(a => newCentroid[a] = 0);
        cluster.forEach(p => {
            streams.forEach(a => newCentroid[a] += p[a]);
        });
        streams.forEach(a => newCentroid[a] = newCentroid[a] / cluster.length);
        const value = { index: i, value: Math.sqrt(d3.sum(streams, a => Math.pow(newCentroid[a], 2)))};
        values.push(value);
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
        flow.push(...cluster.map(p => { 
            const point = { index: p.index, value: indexToValue[i] };
            otherStreams.filter(s => s in data).forEach(a => point[a] = p[a]);
            return point;
        }));
    });
    flow.sort((a, b) => a.index - b.index);

    flow.forEach((d, i) => {
        d.timeStep = i < flow.length - 1 ? d.timeStep = flow[i + 1].time - d.time : 1;
    });

    savedFlow = flow;

    visualizeActivityStream(flow);
};

const downloadSvg = () => {
    convertSVGtoImg();
};

const fetchActivityStream = (activity) => {
    d3.select("#activity-container").style("display", "none");
    d3.select("#visualization-container").style("display", "block");
    
    d3.selectAll("#visualization > *").remove();

    let xhr = new XMLHttpRequest();
    xhr.open("GET", `https://www.strava.com/api/v3/activities/${activity.id}/streams` +
        `?keys=[${intensityStreams.join(",") + "," + otherStreams.join(",")}]&key_by_type=true`);
    xhr.setRequestHeader("Authorization", "Bearer " + accessCode);
    xhr.send();

    xhr.onreadystatechange = (e) => {
        if (xhr.readyState === 4) {
            res = JSON.parse(xhr.responseText);
            if ("heartrate" in res) {
                savedActivity = activity;
                savedStream = res;
                computeData(res);
            } else {
                console.log("Server error: " + res.message);
            }
        }
    };
};

const populateActivities = () => {
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
        `?page=${page++}&per_page=10`);
    xhr.setRequestHeader("Authorization", "Bearer " + accessCode);
    xhr.send();

    xhr.onreadystatechange = (e) => {
        if (xhr.readyState === 4) {
            try {
                res = JSON.parse(xhr.responseText);
                if (Array.isArray(res)) {
                    activities.push(...res);
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
    d3.selectAll("#back-button").on("click", populateActivities);
    d3.selectAll("#download-button").on("click", downloadSvg);
    d3.selectAll("#more-button").on("click", fetchActivities);
    d3.selectAll("input").on("change", updateSettings);

    let url = new URL(window.location.href);
    let cookies = document.cookie.split('; ').reduce((prev, current) => {
        const [name, ...value] = current.split('=');
        prev[name] = value.join('=');
        return prev;
    }, {});

    if ("settings" in cookies) {
        settings = cookies["settings"];
    }

    setupSettings();

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
            "&refresh_token=" + refreshCode +
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