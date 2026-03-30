precision highp float;

uniform sampler2D u_image;
uniform sampler2D u_maskTexture;
uniform float u_maskEnabled;
uniform float u_maskOpacity;
uniform float u_flipY;

uniform float u_brightness;
uniform float u_contrast;
uniform float u_saturation;
uniform float u_hue;
uniform float u_temperature;
uniform float u_tint;
uniform float u_exposure;
uniform float u_highlights;
uniform float u_shadows;
uniform float u_vibrance;
uniform float u_clarity;

varying vec2 v_texCoord;

vec3 rgb2hsl(vec3 c) {
    float maxC = max(max(c.r, c.g), c.b);
    float minC = min(min(c.r, c.g), c.b);
    float l = (maxC + minC) / 2.0;

    if (maxC == minC) {
        return vec3(0.0, 0.0, l);
    }

    float d = maxC - minC;
    float s = l > 0.5 ? d / (2.0 - maxC - minC) : d / (maxC + minC);

    float h;
    if (maxC == c.r) {
        h = (c.g - c.b) / d + (c.g < c.b ? 6.0 : 0.0);
    } else if (maxC == c.g) {
        h = (c.b - c.r) / d + 2.0;
    } else {
        h = (c.r - c.g) / d + 4.0;
    }
    h /= 6.0;

    return vec3(h, s, l);
}

float hue2rgb(float p, float q, float t) {
    if (t < 0.0) t += 1.0;
    if (t > 1.0) t -= 1.0;
    if (t < 1.0 / 6.0) return p + (q - p) * 6.0 * t;
    if (t < 1.0 / 2.0) return q;
    if (t < 2.0 / 3.0) return p + (q - p) * (2.0 / 3.0 - t) * 6.0;
    return p;
}

vec3 hsl2rgb(vec3 c) {
    float h = c.x;
    float s = c.y;
    float l = c.z;

    if (s == 0.0) {
        return vec3(l);
    }

    float q = l < 0.5 ? l * (1.0 + s) : l + s - l * s;
    float p = 2.0 * l - q;

    float r = hue2rgb(p, q, h + 1.0 / 3.0);
    float g = hue2rgb(p, q, h);
    float b = hue2rgb(p, q, h - 1.0 / 3.0);

    return vec3(r, g, b);
}

void main() {
    vec2 imageCoord = u_flipY > 0.5 ? vec2(v_texCoord.x, 1.0 - v_texCoord.y) : v_texCoord;
    vec4 color = texture2D(u_image, imageCoord);
    vec3 original = color.rgb;
    vec3 rgb = original;

    if (u_exposure != 0.0) {
        rgb *= pow(2.0, u_exposure);
    }

    if (u_temperature != 0.0 || u_tint != 0.0) {
        float rGain = 1.0 + u_temperature * 0.15 + u_tint * 0.05;
        float gGain = 1.0 - u_tint * 0.10;
        float bGain = 1.0 - u_temperature * 0.15 + u_tint * 0.05;

        rgb.r *= rGain;
        rgb.g *= gGain;
        rgb.b *= bGain;
    }

    rgb *= u_brightness;

    if (u_saturation != 1.0 || u_hue != 0.0 || u_vibrance != 0.0) {
        vec3 hsl = rgb2hsl(clamp(rgb, 0.0, 1.0));
        hsl.y *= u_saturation;

        if (u_vibrance != 0.0) {
            float vibMask = 1.0 - hsl.y;
            hsl.y += vibMask * u_vibrance * (1.0 - hsl.y) * 0.5;
        }

        hsl.y = clamp(hsl.y, 0.0, 1.0);
        hsl.x = mod(hsl.x + u_hue / 6.283185, 1.0);
        rgb = hsl2rgb(hsl);
    }

    if (u_shadows != 0.0 || u_highlights != 0.0) {
        float luminance = dot(rgb, vec3(0.299, 0.587, 0.114));
        float shadowMask = 1.0 - smoothstep(0.0, 0.5, luminance);
        float highlightMask = smoothstep(0.5, 1.0, luminance);

        rgb += shadowMask * u_shadows * 0.4;
        rgb += highlightMask * u_highlights * 0.4;
    }

    if (u_clarity > 0.0) {
        float luminance = dot(rgb, vec3(0.299, 0.587, 0.114));
        float midtoneMask = 1.0 - abs(luminance - 0.5) * 2.0;
        midtoneMask = max(0.0, midtoneMask);
        float clarityAmount = u_clarity * 0.3;
        rgb = mix(rgb, (rgb - 0.5) * (1.0 + clarityAmount) + 0.5, midtoneMask);
    }

    rgb = (rgb - 0.5) * u_contrast + 0.5;

    if (u_maskEnabled > 0.5) {
        float mask = texture2D(u_maskTexture, v_texCoord).r * u_maskOpacity;
        mask = clamp(mask, 0.0, 1.0);
        rgb = mix(original, rgb, mask);
    }

    gl_FragColor = vec4(clamp(rgb, 0.0, 1.0), color.a);
}