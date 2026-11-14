// Real67 Studio masaüstü uygulaması: servisin sunduğu arayüzü saydam, kendi
// penceresi olan bir Qt penceresinde gösterir. Hyprland pencereyi "real67"
// uygulama kimliğinden tanır ve sağ alt çeyreğe yerleştirir.
#include <QDir>
#include <QGuiApplication>
#include <QLockFile>
#include <QProcess>
#include <QQmlApplicationEngine>
#include <QQuickWindow>
#include <QStandardPaths>
#include <QtWebEngineQuick>

int main(int argc, char *argv[])
{
    // Arka planın gerçekten saydam olması (yazılar net kalırken masaüstünün
    // görünmesi) için pencerenin alfa kanalı olmalı.
    QQuickWindow::setDefaultAlphaBuffer(true);
    QtWebEngineQuick::initialize();
    QGuiApplication app(argc, argv);
    app.setApplicationName("real67");
    app.setOrganizationName("real67");
    app.setDesktopFileName("real67");

    // Açılışta ikinci kez başlatılırsa ikinci bir pencere açılmasın.
    QString runtime = QStandardPaths::writableLocation(QStandardPaths::RuntimeLocation);
    if (runtime.isEmpty())
        runtime = QDir::tempPath();
    QLockFile lock(QDir(runtime).filePath("real67.lock"));
    if (!lock.tryLock(100))
        return 0;

    // Servis kapalıysa başlatılır. Arayüz servis hazır olana kadar yeniden
    // yüklemeyi dener ve hazır olunca Hive duraklatmasını kaldırır (Main.qml).
    QProcess::startDetached("systemctl", {"--user", "start", "real67-studio.service"});

    QQmlApplicationEngine engine;
    QObject::connect(&engine, &QQmlApplicationEngine::objectCreationFailed, &app,
                     [] { QCoreApplication::exit(1); }, Qt::QueuedConnection);
    engine.load(QUrl("qrc:/Main.qml"));
    return app.exec();
}
