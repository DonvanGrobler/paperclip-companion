#pragma once
#include <winrt/Windows.Data.Json.h>
#include <winrt/Windows.Foundation.Collections.h>
#include <io.h>
#include <fcntl.h>
#include <cmath>
#include <string>

struct TransportContext final {
    std::string sessionId, requestId, targetId;
    unsigned long long generation{};
};

static bool transportId(const std::string& value) {
    if (value.empty() || value.size() > 128) return false;
    for (const char character : value) {
        const auto c = static_cast<unsigned char>(character);
        if (!((c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') ||
            (c >= '0' && c <= '9') || c == '_' || c == '-')) return false;
    }
    return true;
}

static TransportContext readTransportContext() {
    stage = "transport-context";
    std::string input;
    for (int c = std::fgetc(stdin); c != EOF; c = std::fgetc(stdin)) {
        require(input.size() < 1024);
        input.push_back(static_cast<char>(c));
    }
    require(std::ferror(stdin) == 0);
    const auto value = winrt::Windows::Data::Json::JsonObject::Parse(winrt::to_hstring(input));
    require(value.Size() == 4);
    TransportContext context;
    context.sessionId = winrt::to_string(value.GetNamedString(L"sessionId"));
    context.requestId = winrt::to_string(value.GetNamedString(L"requestId"));
    context.targetId = winrt::to_string(value.GetNamedString(L"targetId"));
    const double generation = value.GetNamedNumber(L"generation");
    require(transportId(context.sessionId) && transportId(context.requestId) && transportId(context.targetId));
    require(std::isfinite(generation) && generation >= 1 && generation <= 9007199254740991.0 &&
        std::floor(generation) == generation);
    context.generation = static_cast<unsigned long long>(generation);
    return context;
}

static int transportSelfTest() {
    stage = "transport-pipes";
    require(GetFileType(GetStdHandle(STD_INPUT_HANDLE)) == FILE_TYPE_PIPE &&
        GetFileType(GetStdHandle(STD_OUTPUT_HANDLE)) == FILE_TYPE_PIPE);
    require(_setmode(_fileno(stdin), _O_BINARY) != -1 && _setmode(_fileno(stdout), _O_BINARY) != -1);
    Apartment apartment;
    const auto context = readTransportContext();
    FramePixels pixels;
    {
        FixtureClass fixtureClass;
        SyntheticWindow window;
        window.present();
        Binding binding(window);
        FrameMetrics metrics;
        require(captureOne(binding, FrameMode::success, metrics, &pixels));
        stage = "transport-native-cleanup";
        require(metrics.starts == 1 && metrics.accepted == 1 && metrics.frames == 1 &&
            metrics.poolsClosed == metrics.pools && metrics.sessionsClosed == metrics.sessions &&
            metrics.framesClosed == metrics.frames && metrics.cleanupErrors == 0);
        window.close();
        awaitClosed(binding);
    }
    stage = "transport-output";
    require(pixels.width > 0 && pixels.height > 0 && pixels.width <= 1024 && pixels.height <= 1024 &&
        pixels.bytes.size() == static_cast<size_t>(pixels.width) * static_cast<size_t>(pixels.height) * 4);
    // Every interpolated ID is validated ASCII; no escaping or arbitrary text.
    const std::string header = "{\"version\":1,\"sessionId\":\"" + context.sessionId +
        "\",\"generation\":" + std::to_string(context.generation) + ",\"requestId\":\"" + context.requestId +
        "\",\"targetId\":\"" + context.targetId + "\",\"status\":\"frame\",\"format\":\"bgra8\",\"width\":" +
        std::to_string(pixels.width) + ",\"height\":" + std::to_string(pixels.height) +
        ",\"byteLength\":" + std::to_string(pixels.bytes.size()) + "}";
    require(!header.empty() && header.size() <= 1024);
    unsigned char prefix[4]{};
    for (unsigned i = 0; i < 4; ++i) prefix[i] = static_cast<unsigned char>((header.size() >> (i * 8)) & 0xff);
    require(std::fwrite(prefix, 1, sizeof(prefix), stdout) == sizeof(prefix));
    require(std::fwrite(header.data(), 1, header.size(), stdout) == header.size());
    require(std::fwrite(pixels.bytes.data(), 1, pixels.bytes.size(), stdout) == pixels.bytes.size());
    require(std::fflush(stdout) == 0);
    // No PASS output in binary mode. All pixels are cleared by owned-buffer RAII.
    return 0;
}
