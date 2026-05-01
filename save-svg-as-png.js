const dataHeader = 'data:image/svg+xml;charset=utf-8';
const picSize = 1000;

const loadImage = async url => {
    const $img = document.createElement('img');
    $img.clientWidth = picSize;
    $img.clientHeight = picSize;
    $img.src = url;
    return new Promise((resolve, reject) => {
        $img.onload = () => resolve($img)
        $img.onerror = reject
    });
};

const serializeAsXML = $e => (new XMLSerializer()).serializeToString($e);

const encodeAsUTF8 = s => `${dataHeader},${encodeURIComponent(s)}`;

const getImageURL = async (svg, svgURL, { format, quality }) => {
    const img = await loadImage(svgURL);

    const $canvas = document.createElement('canvas');
    $canvas.width = picSize;
    $canvas.height = picSize;
    $canvas.getContext('2d').drawImage(img, 0, 0, picSize, picSize);
    
    return $canvas.toDataURL(`image/${format}`, quality);
};

const convertSVGtoImg = async () => {
    const $svg = document.getElementById('visualization');

    const svgURL = encodeAsUTF8(serializeAsXML($svg));

    const dataURL = await getImageURL($svg, svgURL, { format: "png", quality: 1 })

    const a = document.createElement("a");
    a.href = dataURL;
    a.download = "activity-intensity.png";
    document.body.appendChild(a);
    a.click();
    URL.revokeObjectURL(dataURL);
    document.body.removeChild(a);
};