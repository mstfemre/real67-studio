import QtQuick
import QtQuick.Window
import QtWebEngine

// Pencerenin kendisi saydam; cam rengini ve bulanıklığı arayüz (CSS) ile
// Hyprland verir. Konum ve boyut Hyprland kuralından gelir.
Window {
    id: win
    width: 1250
    height: 690
    visible: true
    title: "Real67 Studio"
    color: "transparent"

    readonly property string base: "http://localhost:8667"

    WebEngineProfile {
        id: profile
        storageName: "real67"
        offTheRecord: false
        httpCacheType: WebEngineProfile.NoCache
    }

    function resume() {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", base + "/api/resume");
        xhr.setRequestHeader("Content-Type", "application/json");
        xhr.send("{}");
    }

    WebEngineView {
        id: view
        anchors.fill: parent
        profile: profile
        backgroundColor: "transparent"
        // Pencere daraldıkça arayüz orantılı küçülür (döşenen pencere çok farklı
        // boyutlarda olabilir); 1100 px ve üstünde gerçek boyut.
        zoomFactor: Math.max(0.7, Math.min(1, win.width / 1100))
        url: win.base + "/studio/?desktop"
        settings.localStorageEnabled: true
        settings.showScrollBars: false

        onLoadingChanged: (info) => {
            if (info.status === WebEngineView.LoadFailedStatus)
                retry.start();
            else if (info.status === WebEngineView.LoadSucceededStatus)
                win.resume();
        }
        // Bağlantılar sistem tarayıcısında açılır.
        onNewWindowRequested: (request) => Qt.openUrlExternally(request.requestedUrl)
    }

    // Servis açılışta birkaç saniye geç kalkabilir.
    Timer { id: retry; interval: 500; onTriggered: view.reload() }

    Shortcut { sequences: ["Ctrl+Q"]; context: Qt.ApplicationShortcut; onActivated: Qt.quit() }
    Shortcut { sequences: ["Ctrl+R", "F5"]; context: Qt.ApplicationShortcut; onActivated: view.reload() }
}
