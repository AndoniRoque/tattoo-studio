"use client";

import { useEffect, useState } from "react";
import {
  Alert,
  Badge,
  Box,
  Button,
  ChakraProvider,
  Container,
  Flex,
  Heading,
  Input,
  SimpleGrid,
  Spinner,
  Stack,
  Text,
  defaultSystem,
} from "@chakra-ui/react";

type Auth = { userId: string; studioId: string; role: "OWNER" | "ARTIST" };
type User = { id: string; name: string; email: string };
type Artist = User & { role: "ARTIST"; isActive: boolean };
type Schedule = {
  id: string;
  artistId: string;
  weekday: number;
  startTime: string;
  endTime: string;
  slotMinutes: number;
};

type LoginResponse = {
  token: string;
  user: User;
  studioId: string;
  role: Auth["role"];
};

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";
const weekdays = [
  "Domingo",
  "Lunes",
  "Martes",
  "MiÃ©rcoles",
  "Jueves",
  "Viernes",
  "SÃ¡bado",
];

export default function BackofficePage() {
  const [token, setToken] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [auth, setAuth] = useState<Auth | null>(null);
  const [artists, setArtists] = useState<Artist[]>([]);
  const [selectedArtistId, setSelectedArtistId] = useState("");
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loginForm, setLoginForm] = useState({ email: "", password: "" });
  const [scheduleForm, setScheduleForm] = useState({
    weekday: "1",
    startTime: "10:00",
    endTime: "18:00",
    slotMinutes: "60",
  });
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const savedToken = window.localStorage.getItem("tattoo_access_token");
    if (!savedToken) {
      setLoading(false);
      return;
    }
    setToken(savedToken);
    void loadSession(savedToken);
  }, []);

  async function loadSession(accessToken: string) {
    try {
      const response = await fetch(`${apiUrl}/auth/me`, {
        headers: authHeaders(accessToken),
      });
      if (!response.ok)
        throw new Error("La sesiÃ³n expirÃ³. VolvÃ© a ingresar.");
      const data = await response.json();
      setUser(data.user);
      setAuth(data.auth);
      setSelectedArtistId(data.auth.role === "ARTIST" ? data.auth.userId : "");
      if (data.auth.role === "OWNER") await loadArtists(accessToken);
      await loadSchedules(
        accessToken,
        data.auth.role === "ARTIST" ? data.auth.userId : undefined,
      );
    } catch (sessionError) {
      logout();
      setError(
        sessionError instanceof Error
          ? sessionError.message
          : "No pudimos recuperar la sesiÃ³n.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function login(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch(`${apiUrl}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(loginForm),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error ?? "Email o contraseÃ±a incorrectos.");
      window.localStorage.setItem("tattoo_access_token", data.token);
      setToken(data.token);
      await loadSession(data.token);
    } catch (loginError) {
      setError(
        loginError instanceof Error
          ? loginError.message
          : "No pudimos iniciar sesiÃ³n.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function loadArtists(accessToken: string) {
    const response = await fetch(`${apiUrl}/artists`, {
      headers: authHeaders(accessToken),
    });
    if (!response.ok) throw new Error("No pudimos cargar los artistas.");
    setArtists(await response.json());
  }

  async function loadSchedules(accessToken: string, artistId?: string) {
    const query = artistId ? `?artistId=${artistId}` : "";
    const response = await fetch(`${apiUrl}/schedules${query}`, {
      headers: authHeaders(accessToken),
    });
    if (!response.ok) throw new Error("No pudimos cargar los horarios.");
    setSchedules(await response.json());
  }

  async function createSchedule(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !auth) return;
    setSubmitting(true);
    setError("");
    try {
      const body = {
        ...scheduleForm,
        weekday: Number(scheduleForm.weekday),
        slotMinutes: Number(scheduleForm.slotMinutes),
        ...(auth.role === "OWNER" ? { artistId: selectedArtistId } : {}),
      };
      const response = await fetch(`${apiUrl}/schedules`, {
        method: "POST",
        headers: { ...authHeaders(token), "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error ?? "No pudimos crear el horario.");
      setSchedules((current) =>
        [...current, data].sort(
          (left, right) =>
            left.weekday - right.weekday ||
            left.startTime.localeCompare(right.startTime),
        ),
      );
    } catch (scheduleError) {
      setError(
        scheduleError instanceof Error
          ? scheduleError.message
          : "No pudimos crear el horario.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function deleteSchedule(scheduleId: string) {
    if (!token) return;
    setError("");
    const response = await fetch(`${apiUrl}/schedules/${scheduleId}`, {
      method: "DELETE",
      headers: authHeaders(token),
    });
    if (!response.ok) {
      const data = await response.json();
      setError(data.error ?? "No pudimos eliminar el horario.");
      return;
    }
    setSchedules((current) =>
      current.filter((schedule) => schedule.id !== scheduleId),
    );
  }

  function selectArtist(artistId: string) {
    setSelectedArtistId(artistId);
    if (token)
      void loadSchedules(token, artistId || undefined).catch((loadError) =>
        setError(
          loadError instanceof Error
            ? loadError.message
            : "No pudimos cargar los horarios.",
        ),
      );
  }

  function logout() {
    window.localStorage.removeItem("tattoo_access_token");
    setToken("");
    setUser(null);
    setAuth(null);
    setSchedules([]);
  }

  if (loading)
    return (
      <ChakraProvider value={defaultSystem}>
        <Flex minH="100vh" align="center" justify="center">
          <Spinner color="var(--accent)" size="xl" />
        </Flex>
      </ChakraProvider>
    );

  return (
    <ChakraProvider value={defaultSystem}>
      <Box minH="100vh" background="var(--paper)">
        {!auth ? (
          <LoginView
            form={loginForm}
            setForm={setLoginForm}
            submit={login}
            submitting={submitting}
            error={error}
          />
        ) : (
          <Container maxW="1180px" py={{ base: 6, md: 10 }}>
            <Flex
              justify="space-between"
              align={{ base: "start", md: "center" }}
              direction={{ base: "column", md: "row" }}
              gap="4"
              mb="12"
            >
              <Box>
                <Text
                  fontSize="xs"
                  color="var(--accent-dark)"
                  fontWeight="700"
                  letterSpacing="0.14em"
                >
                  BACKOFFICE / HORARIOS
                </Text>
                <Heading
                  fontFamily="var(--font-display), serif"
                  fontSize={{ base: "4xl", md: "6xl" }}
                  fontWeight="500"
                >
                  Tu semana, bajo control.
                </Heading>
                <Text color="var(--muted)" mt="2">
                  Hola, {user?.name}. ConfigurÃ¡ cuÃ¡ndo recibe reservas cada
                  artista.
                </Text>
              </Box>
              <Button variant="outline" onClick={logout}>
                Cerrar sesiÃ³n
              </Button>
            </Flex>
            {error && (
              <Alert.Root status="error" mb="6">
                <Alert.Indicator />
                <Alert.Content>
                  <Alert.Title>Hay algo para revisar</Alert.Title>
                  <Alert.Description>{error}</Alert.Description>
                </Alert.Content>
              </Alert.Root>
            )}
            <SimpleGrid columns={{ base: 1, lg: 2 }} gap="8" alignItems="start">
              <Box
                background="var(--card)"
                border="1px solid var(--line)"
                borderRadius="16px"
                p={{ base: 5, md: 7 }}
              >
                <Text
                  fontSize="xs"
                  fontWeight="700"
                  letterSpacing="0.1em"
                  color="var(--accent-dark)"
                >
                  NUEVA REGLA SEMANAL
                </Text>
                <Heading mt="2" fontSize="2xl">
                  Agregar disponibilidad
                </Heading>
                <form onSubmit={createSchedule}>
                  <Stack gap="4" mt="6">
                    {auth.role === "OWNER" && (
                      <Box>
                        <Text fontSize="sm" fontWeight="600" mb="2">
                          Artista
                        </Text>
                        <select
                          className="field"
                          required
                          value={selectedArtistId}
                          onChange={(event) => selectArtist(event.target.value)}
                        >
                          <option value="">ElegÃ­ un artista</option>
                          {artists
                            .filter((artist) => artist.isActive)
                            .map((artist) => (
                              <option key={artist.id} value={artist.id}>
                                {artist.name}
                              </option>
                            ))}
                        </select>
                      </Box>
                    )}
                    <Box>
                      <Text fontSize="sm" fontWeight="600" mb="2">
                        DÃ­a
                      </Text>
                      <select
                        className="field"
                        value={scheduleForm.weekday}
                        onChange={(event) =>
                          setScheduleForm({
                            ...scheduleForm,
                            weekday: event.target.value,
                          })
                        }
                      >
                        {weekdays.map((day, index) => (
                          <option key={day} value={index}>
                            {day}
                          </option>
                        ))}
                      </select>
                    </Box>
                    <SimpleGrid columns={2} gap="4">
                      <Box>
                        <Text fontSize="sm" fontWeight="600" mb="2">
                          Desde
                        </Text>
                        <Input
                          type="time"
                          value={scheduleForm.startTime}
                          onChange={(event) =>
                            setScheduleForm({
                              ...scheduleForm,
                              startTime: event.target.value,
                            })
                          }
                        />
                      </Box>
                      <Box>
                        <Text fontSize="sm" fontWeight="600" mb="2">
                          Hasta
                        </Text>
                        <Input
                          type="time"
                          value={scheduleForm.endTime}
                          onChange={(event) =>
                            setScheduleForm({
                              ...scheduleForm,
                              endTime: event.target.value,
                            })
                          }
                        />
                      </Box>
                    </SimpleGrid>
                    <Box>
                      <Text fontSize="sm" fontWeight="600" mb="2">
                        DuraciÃ³n de cada turno
                      </Text>
                      <select
                        className="field"
                        value={scheduleForm.slotMinutes}
                        onChange={(event) =>
                          setScheduleForm({
                            ...scheduleForm,
                            slotMinutes: event.target.value,
                          })
                        }
                      >
                        <option value="30">30 minutos</option>
                        <option value="60">1 hora</option>
                        <option value="90">1 hora 30 minutos</option>
                        <option value="120">2 horas</option>
                      </select>
                    </Box>
                    <Button
                      type="submit"
                      loading={submitting}
                      loadingText="Guardando"
                      background="var(--accent)"
                      color="white"
                      _hover={{ background: "var(--accent-dark)" }}
                    >
                      Guardar horario
                    </Button>
                  </Stack>
                </form>
              </Box>
              <Box>
                <Flex justify="space-between" align="center" mb="4">
                  <Box>
                    <Text
                      fontSize="xs"
                      fontWeight="700"
                      letterSpacing="0.1em"
                      color="var(--accent-dark)"
                    >
                      DISPONIBILIDAD ACTUAL
                    </Text>
                    <Heading mt="2" fontSize="2xl">
                      Horarios publicados
                    </Heading>
                  </Box>
                  {auth.role === "OWNER" && (
                    <select
                      className="field compact"
                      value={selectedArtistId}
                      onChange={(event) => selectArtist(event.target.value)}
                    >
                      <option value="">Todos los artistas</option>
                      {artists.map((artist) => (
                        <option key={artist.id} value={artist.id}>
                          {artist.name}
                        </option>
                      ))}
                    </select>
                  )}
                </Flex>
                <Stack gap="3">
                  {schedules.length === 0 ? (
                    <Box
                      background="var(--card)"
                      border="1px dashed var(--line)"
                      borderRadius="12px"
                      p="8"
                    >
                      <Text color="var(--muted)">
                        TodavÃ­a no hay horarios cargados para esta vista.
                      </Text>
                    </Box>
                  ) : (
                    schedules.map((schedule) => (
                      <Flex
                        key={schedule.id}
                        background="var(--card)"
                        border="1px solid var(--line)"
                        borderRadius="12px"
                        p="4"
                        justify="space-between"
                        align="center"
                        gap="4"
                      >
                        <Box>
                          <Text fontWeight="700">
                            {weekdays[schedule.weekday]}
                          </Text>
                          <Text color="var(--muted)" fontSize="sm">
                            {schedule.startTime} a {schedule.endTime} Â· turnos
                            de {schedule.slotMinutes} min
                          </Text>
                          {auth.role === "OWNER" && (
                            <Badge mt="2" colorPalette="green" variant="subtle">
                              {artists.find(
                                (artist) => artist.id === schedule.artistId,
                              )?.name ?? "Artista"}
                            </Badge>
                          )}
                        </Box>
                        <Button
                          size="sm"
                          variant="ghost"
                          colorPalette="red"
                          onClick={() => void deleteSchedule(schedule.id)}
                        >
                          Eliminar
                        </Button>
                      </Flex>
                    ))
                  )}
                </Stack>
              </Box>
            </SimpleGrid>
          </Container>
        )}
      </Box>
    </ChakraProvider>
  );
}

function LoginView({
  form,
  setForm,
  submit,
  submitting,
  error,
}: {
  form: { email: string; password: string };
  setForm: (value: { email: string; password: string }) => void;
  submit: (event: React.FormEvent<HTMLFormElement>) => void;
  submitting: boolean;
  error: string;
}) {
  return (
    <Container maxW="520px" py={{ base: 12, md: 24 }}>
      <Box
        background="var(--card)"
        border="1px solid var(--line)"
        borderRadius="18px"
        p={{ base: 6, md: 10 }}
        boxShadow="0 24px 70px rgba(40, 36, 26, 0.1)"
      >
        <Text
          fontSize="xs"
          color="var(--accent-dark)"
          fontWeight="700"
          letterSpacing="0.14em"
        >
          STUDIO / ACCESO
        </Text>
        <Heading
          fontFamily="var(--font-display), serif"
          fontSize="5xl"
          fontWeight="500"
          mt="3"
        >
          EntrÃ¡ a tu estudio.
        </Heading>
        <Text color="var(--muted)" mt="3">
          GestionÃ¡ horarios, reservas y clientes desde un solo lugar.
        </Text>
        {error && (
          <Alert.Root status="error" mt="6">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Description>{error}</Alert.Description>
            </Alert.Content>
          </Alert.Root>
        )}
        <form onSubmit={submit}>
          <Stack gap="4" mt="8">
            <Input
              type="email"
              placeholder="Email"
              required
              value={form.email}
              onChange={(event) =>
                setForm({ ...form, email: event.target.value })
              }
            />
            <Input
              type="password"
              placeholder="ContraseÃ±a"
              required
              value={form.password}
              onChange={(event) =>
                setForm({ ...form, password: event.target.value })
              }
            />
            <Button
              type="submit"
              loading={submitting}
              loadingText="Ingresando"
              background="var(--accent)"
              color="white"
              _hover={{ background: "var(--accent-dark)" }}
            >
              Ingresar
            </Button>
          </Stack>
        </form>
      </Box>
    </Container>
  );
}

function authHeaders(accessToken: string) {
  return { Authorization: `Bearer ${accessToken}` };
}
