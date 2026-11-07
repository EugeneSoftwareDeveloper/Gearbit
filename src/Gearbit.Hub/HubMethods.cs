using System.Reflection;
using System.Text.Json.Nodes;
using Gearbit.Core.Components;
using Gearbit.Core.Robots;
using Gearbit.Emulator;
using Gearbit.Hub.Programs;
using Gearbit.Hub.Rpc;

namespace Gearbit.Hub;

/// <summary>
/// Методы JSON-RPC хаба. Описание для разработчика — docs/dev/hub-api.md.
/// Все мощности — в процентах −100..100; лимиты сборки и арбитр применяются здесь, а не в клиентах.
/// </summary>
public sealed class HubMethods(
    RobotManager robots,
    ControlArbiter arbiter,
    ClientRegistry clients,
    HubOptions options,
    ServiceMode service,
    ProgramRunner programs,
    EmulatorHost? emulator = null)
{
    public static string Version { get; } =
        typeof(HubMethods).Assembly.GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion.Split('+')[0] ?? "0.0.0";

    public void Register(RpcDispatcher rpc)
    {
        ArgumentNullException.ThrowIfNull(rpc);

        rpc.Register("hub.hello", "Представиться: {name, runId?}. runId передаёт программа, которую запустил хаб. Возвращает версию хаба, id клиента и текущее состояние.", (client, p) =>
        {
            client.Name = p.OptionalString("name") ?? client.Name;
            if (p.OptionalString("runId") is { } runId)
            {
                programs.Bind(client, runId);
            }

            return new
            {
                hub = "Gearbit",
                version = Version,
                clientId = client.Id,
                transports = robots.TransportKinds,
                robot = robots.Active is { } r ? RobotDto.From(r) : null,
                control = Control(client),
            };
        });

        rpc.Register("hub.methods", "Список методов с кратким описанием.", (_, _) =>
            rpc.Methods.Select(m => new { name = m.Name, summary = m.Summary }));

        rpc.Register("catalog.get", "Известные модели роботов и сборки.", (_, _) => CatalogDto.From(robots.Catalog));

        rpc.Register(
            "robot.scan",
            "Поиск устройств: {durationMs?}. Возвращает {devices, warnings}.",
            async (_, p, ct) =>
            {
                var duration = TimeSpan.FromMilliseconds(Math.Clamp(p.OptionalInt("durationMs") ?? options.ScanDurationMs, 0, 30_000));
                var report = await robots.ScanAsync(duration, ct).ConfigureAwait(false);
                return new
                {
                    devices = report.Devices.Select(r => new ScanDeviceDto(
                        r.Device.Id, string.IsNullOrEmpty(r.Device.Name) ? "(без имени)" : r.Device.Name, r.Device.Rssi,
                        r.Device.TransportKind, r.DescriptorId, r.DescriptorTitle, r.DescriptorId is not null)),
                    warnings = report.Warnings,
                };
            },
            concurrent: true);

        rpc.Register(
            "robot.connect",
            "Подключиться: {id, deviceId?, profileId?}. id — из robot.scan (эмулятор: emulator:superbot).",
            async (_, p, ct) =>
            {
                arbiter.Reset();
                var robot = await robots.ConnectAsync(p.String("id"), p.OptionalString("deviceId"), p.OptionalString("profileId"), ct).ConfigureAwait(false);
                return RobotDto.From(robot);
            },
            concurrent: true);

        rpc.Register(
            "robot.disconnect",
            "Отключиться от робота (моторы останавливаются).",
            async (_, _, _) =>
            {
                await robots.DisconnectAsync().ConfigureAwait(false);
                arbiter.Reset();
                return true;
            },
            concurrent: true);

        rpc.Register("robot.info", "Подключённый робот: компоненты, сборка, прошивка (или null).", (_, _) =>
            robots.Active is { } r ? RobotDto.From(r) : null);

        rpc.Register("robot.telemetry", "Последние показания датчиков и состояние выходов.", (_, _) => TelemetryDto.From(RequireRobot()));

        rpc.Register(
            "robot.stop",
            "СТОП: остановить все моторы. Разрешён всем и всегда.",
            async (_, _, _) =>
            {
                if (robots.Active is { State: RobotConnectionState.Connected } robot)
                {
                    await robot.StopAllAsync().ConfigureAwait(false);
                }

                service.Disarm();
                await programs.StopProgramAsync("stopped", wait: false).ConfigureAwait(false);

                clients.Broadcast("safety.event", new { reason = "stop", message = "Остановлено кнопкой СТОП" });
                return true;
            },
            concurrent: true);

        rpc.Register("robot.setMaxPower", "Общий предел мощности, %: {percent}.", (_, p) =>
        {
            var robot = RequireRobot();
            robot.MaxPowerPercent = p.Int("percent");
            clients.Broadcast("robot.info", RobotDto.From(robot));
            return robot.MaxPowerPercent;
        });

        rpc.Register("motor.setPower", "Мощность мотора: {id, power, source?}. id — M1 или псевдоним сборки (left_wheel).", (client, p) =>
        {
            var robot = RequireMotion(client, p);
            var motor = robot.Find<IMotor>(p.String("id")) ?? throw new HubException(HubErrors.NotFound, $"Нет мотора «{p.String("id")}».");
            motor.SetPower(p.Int("power"));
            return motor.Power;
        });

        rpc.Register("drive.tank", "Танковое управление: {left, right, source?}, −100..100.", (client, p) =>
        {
            RequireDrive(RequireMotion(client, p)).Tank(p.Int("left"), p.Int("right"));
            return true;
        });

        rpc.Register("drive.arcade", "Газ и поворот (как стик): {throttle, turn, source?}, −100..100; поворот + — направо.", (client, p) =>
        {
            RequireDrive(RequireMotion(client, p)).Arcade(p.Int("throttle"), p.Int("turn"));
            return true;
        });

        rpc.Register("drive.stop", "Остановить привод.", (client, p) =>
        {
            RequireDrive(RequireMotion(client, p)).Stop();
            return true;
        });

        rpc.Register("light.setColor", "Цвет светодиода: {id, color}. Цвета: off, red, orange, yellow, green, cyan, blue, purple, white.", (client, p) =>
        {
            var robot = RequireRobot();
            RequireNoService();
            var light = robot.Find<ILight>(p.String("id")) ?? throw new HubException(HubErrors.NotFound, $"Нет светодиода «{p.String("id")}».");
            light.SetColor(p.Enum<RobotColor>("color"));
            return true;
        });

        rpc.Register("control.get", "Кто сейчас управляет роботом.", (client, _) => Control(client));

        rpc.Register("control.take", "Забрать управление: {source?}.", (client, p) =>
        {
            arbiter.Take(client.Id, client.Name, Source(p));
            return Control(client);
        });

        rpc.Register("control.release", "Отдать управление.", (client, _) => arbiter.Release(client.Id));

        rpc.Register(
            "service.begin",
            "Режим замеров: робот останавливается, обычное управление выключается, кадры шлются вручную (service.send).",
            async (client, _, _) =>
            {
                await service.BeginAsync(client, RequireRobot()).ConfigureAwait(false);
                return true;
            },
            concurrent: true);

        rpc.Register(
            "service.send",
            $"Отправить роботу сырой кадр в режиме замеров: {{hex}}, до {ServiceMode.MaxFrameBytes} байт. Предел мощности не применяется.",
            async (client, p, ct) => await service.SendAsync(client, ServiceMode.ParseHex(p.String("hex")), ct).ConfigureAwait(false),
            concurrent: true);

        rpc.Register(
            "service.end",
            "Закончить замеры: моторы в 0, обычное управление снова работает. Разрешён любому клиенту.",
            async (_, _, _) => await service.EndAsync().ConfigureAwait(false),
            concurrent: true);

        rpc.Register(
            "program.languages",
            "Языки программ: [{id, title, available, version, problem}]. problem — что сделать, если запустить нечем.",
            async (_, _, ct) => await programs.DescribeLanguagesAsync(ct).ConfigureAwait(false),
            concurrent: true);

        rpc.Register(
            "program.run",
            "Запустить программу: {language: python|csharp, code, name?, sensors?: {D1: \"front\"}}. Предыдущая останавливается. Вывод и итог приходят уведомлениями program.output / program.say / program.exited.",
            async (client, p, ct) =>
            {
                var sensors = new Dictionary<string, string>();
                foreach (var (id, value) in p.Node?["sensors"] as JsonObject ?? new JsonObject())
                {
                    if (value is JsonValue v && v.TryGetValue<string>(out var place))
                    {
                        sensors[id] = place;
                    }
                }

                return await programs.RunAsync(client, p.String("language"), p.String("code"), p.OptionalString("name"), sensors, ct).ConfigureAwait(false);
            },
            concurrent: true);

        rpc.Register(
            "program.stop",
            "Остановить программу (процесс завершается). Моторы, которыми она управляла, — в 0. false — ничего не работало.",
            async (_, _, _) => await programs.StopProgramAsync().ConfigureAwait(false),
            concurrent: true);

        rpc.Register("program.status", "Какая программа работает: {runId, language, name, startedAt} или null.", (_, _) => programs.Current);

        rpc.Register("trace.subscribe", "Журнал байтов протокола: {enabled}.", (client, p) => client.TraceEnabled = p.Bool("enabled", true));

        rpc.Register("emulator.subscribe", "Состояние 2D-эмулятора ~15 раз в секунду: {enabled}.", (client, p) => client.EmulatorViewEnabled = p.Bool("enabled", true));

        rpc.Register("emulator.state", "Снимок эмулятора (или null, если он не подключён).", (_, _) =>
            emulator?.Current?.GetSnapshot() is { } s ? EmulatorDto.From(s) : null);

        rpc.Register("emulator.reset", "Вернуть виртуальную машинку на старт.", (_, _) =>
        {
            emulator?.Current?.Reset();
            return true;
        });

        rpc.Register("emulator.setObstacles", "Препятствия комнаты: {obstacles: [{x, y, width, height}]}, см.", (_, p) =>
        {
            if (emulator is null)
            {
                throw new HubException(HubErrors.NotSupported, "Эмулятор не включён.");
            }

            var list = p.Node?["obstacles"]?.AsArray()
                .Select(o => new Obstacle(
                    (double?)o?["x"] ?? 0, (double?)o?["y"] ?? 0, (double?)o?["width"] ?? 10, (double?)o?["height"] ?? 10))
                .ToList() ?? [];
            emulator.World.SetObstacles(list);
            return list.Count;
        });

        rpc.Register(
            "emulator.setSensorAngles",
            "Куда смотрят датчики виртуальной машинки: {angles: {D1: 0}, down: {D2: -2.5}}. angles — градусы от «вперёд» по часовой стрелке, " +
            "down — датчик смотрит в пол (езда по линии), число — смещение поперёк машинки в см, минус — левее. Возвращает {angles, down}.",
            (_, p) =>
            {
                if (emulator is null)
                {
                    throw new HubException(HubErrors.NotSupported, "Эмулятор не включён.");
                }

                return emulator.World.SetSensorMounts(Numbers(p.Node?["angles"]), Numbers(p.Node?["down"]));
            });

        rpc.Register("emulator.setScene", "Что лежит в комнате эмулятора: {scene: \"room\" | \"line\"}. Машинка возвращается на старт сцены.", (_, p) =>
        {
            if (emulator is null)
            {
                throw new HubException(HubErrors.NotSupported, "Эмулятор не включён.");
            }

            var scene = p.Enum<EmulatorScene>("scene");
            emulator.World.SetScene(scene);
            emulator.Current?.Reset();
            return scene;
        });

        rpc.Register("emulator.setTilt", "Наклонить виртуальную машинку: {x, y} в градусах −90..90 (y больше 0 — вперёд, x больше 0 — вправо). {x: 0, y: 0} — ровно. Возвращает {x, y}.", (_, p) =>
        {
            var current = emulator?.Current ?? throw new HubException(HubErrors.NotConnected, "Эмулятор не подключён.");
            var (x, y) = current.SetTilt(p.OptionalInt("x") ?? 0, p.OptionalInt("y") ?? 0);
            return new { x, y };
        });
    }

    /// <summary>Объект {id: число} из параметров; не числа пропускаются.</summary>
    private static Dictionary<string, double> Numbers(JsonNode? node)
    {
        var result = new Dictionary<string, double>();
        foreach (var (id, value) in node as JsonObject ?? new JsonObject())
        {
            if (value is JsonValue v && v.TryGetValue<double>(out var number))
            {
                result[id] = number;
            }
        }

        return result;
    }

    private ProtocolRobot RequireRobot() =>
        robots.Active is { State: RobotConnectionState.Connected } robot
            ? robot
            : throw new HubException(HubErrors.NotConnected, "Робот не подключён.");

    private ProtocolRobot RequireMotion(HubClient client, RpcParams p)
    {
        var robot = RequireRobot();
        RequireNoService();
        arbiter.Authorize(client.Id, client.Name, Source(p));
        return robot;
    }

    /// <summary>Во время замеров желаемое состояние не отправляется — команды пульта и программ отклоняем явно.</summary>
    private void RequireNoService()
    {
        if (service.IsActive)
        {
            throw new HubException(HubErrors.ControlBusy, $"Идут замеры протокола («{service.OwnerName}»): пульт и программы выключены. Закончите замеры в журнале протокола или нажмите СТОП.");
        }
    }

    private static DifferentialDrive RequireDrive(ProtocolRobot robot) =>
        robot.Drive ?? throw new HubException(HubErrors.NotSupported, "У этой сборки нет привода. Управляйте моторами по отдельности.");

    private static ControllerKind Source(RpcParams p) =>
        string.Equals(p.OptionalString("source"), "program", StringComparison.OrdinalIgnoreCase) ? ControllerKind.Program : ControllerKind.Remote;

    private ControlDto Control(HubClient client)
    {
        var owner = arbiter.Owner;
        return new ControlDto(owner?.ClientId, owner?.ClientName, owner?.Kind, owner?.ClientId == client.Id);
    }
}
