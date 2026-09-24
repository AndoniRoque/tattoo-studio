"use client";

import { useEffect, useMemo, useState } from "react";
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
  Textarea,
  defaultSystem,
} from "@chakra-ui/react";

type Studio = {
  name: string;
  slug: string;
  timezone: string;
  phone?: string;
  email?: string;
};
type Artist = { id: string; name: string };
type Slot = { startsAt: string; endsAt: string };

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";
const studioSlug = process.env.NEXT_PUBLIC_STUDIO_SLUG ?? "s1t";

export default function Home() {
  const [studio, setStudio] = useState<Studio | null>(null);
  const [artists, setArtists] = useState<Artist[]>([]);
  const [artistId, setArtistId] = useState("");
  const [date, setDate] = useState("");
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    phone: "",
    email: "",
    tattooStyle: "BLACK_AND_WHITE",
    size: "MEDIUM",
    bodyArea: "",
    description: "",
  });
  const minDate = useMemo(() => new Date().toISOString().slice(0, 10), []);

  useEffect(() => {
    async function loadStudio() {
      try {
        const [studioResponse, artistsResponse] = await Promise.all([
          fetch(`${apiUrl}/public/studios/${studioSlug}`),
          fetch(`${apiUrl}/public/studios/${studioSlug}/artists`),
        ]);
        if (!studioResponse.ok || !artistsResponse.ok)
          throw new Error("No pudimos cargar el estudio.");
        setStudio(await studioResponse.json());
        const availableArtists = await artistsResponse.json();
        setArtists(availableArtists);
        if (availableArtists[0]) setArtistId(availableArtists[0].id);
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "No pudimos cargar el estudio.",
        );
      } finally {
        setLoading(false);
      }
    }
    void loadStudio();
  }, []);

  useEffect(() => {
    if (!artistId || !date) return;
    async function loadSlots() {
      setLoadingSlots(true);
      setSelectedSlot(null);
      try {
        const response = await fetch(
          `${apiUrl}/public/studios/${studioSlug}/availability?artistId=${artistId}&date=${date}`,
        );
        if (!response.ok)
          throw new Error("No pudimos consultar la disponibilidad.");
        const data = await response.json();
        setSlots(data.slots);
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "No pudimos consultar la disponibilidad.",
        );
      } finally {
        setLoadingSlots(false);
      }
    }
    void loadSlots();
  }, [artistId, date]);

  function updateForm(field: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function submitBooking() {
    if (!selectedSlot) {
      setError("Elegí un horario para continuar.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch(
        `${apiUrl}/public/studios/${studioSlug}/bookings`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...form,
            artistId,
            startsAt: selectedSlot.startsAt,
            endsAt: selectedSlot.endsAt,
          }),
        },
      );
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error ?? "No pudimos crear la reserva.");
      setSuccess(data.appointment.id);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "No pudimos crear la reserva.",
      );
    } finally {
      setSubmitting(false);
    }
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
        <Box
          position="absolute"
          inset="0 0 auto"
          h="390px"
          background="linear-gradient(120deg, #e5dfd0 0%, #f4f1e9 58%, #d6dfcf 100%)"
          zIndex={0}
        />
        <Container
          maxW="1180px"
          position="relative"
          zIndex={1}
          py={{ base: 6, md: 10 }}
        >
          <Flex
            justify="space-between"
            align="center"
            mb={{ base: 16, md: 28 }}
          >
            <Text fontWeight="800" letterSpacing="0.12em" fontSize="sm">
              {studio?.name?.toUpperCase() ?? "STUDIO"}
            </Text>
            <Badge
              colorPalette="green"
              variant="subtle"
              px="3"
              py="1"
              borderRadius="full"
            >
              BOOKING ONLINE
            </Badge>
          </Flex>

          <SimpleGrid
            columns={{ base: 1, lg: 2 }}
            gap={{ base: 10, lg: 20 }}
            alignItems="end"
          >
            <Box pb={{ lg: 12 }}>
              <Text
                color="var(--accent-dark)"
                fontWeight="700"
                letterSpacing="0.12em"
                fontSize="xs"
                mb="4"
              >
                TU PRÓXIMA PIEZA EMPIEZA ACÁ
              </Text>
              <Heading
                fontFamily="var(--font-display), serif"
                fontSize={{ base: "5xl", md: "7xl" }}
                lineHeight="0.93"
                fontWeight="500"
                maxW="620px"
              >
                Diseñemos algo que se sienta tuyo.
              </Heading>
              <Text mt="7" maxW="470px" color="var(--muted)" fontSize="lg">
                Elegí artista, horario y contanos la idea. El estudio revisará
                tu solicitud y se pondrá en contacto para confirmar los
                detalles.
              </Text>
            </Box>

            <Box
              as="form"
              onSubmit={() => void submitBooking()}
              background="var(--card)"
              border="1px solid var(--line)"
              borderRadius="18px"
              p={{ base: 5, md: 8 }}
              boxShadow="0 24px 70px rgba(40, 36, 26, 0.12)"
            >
              {success ? (
                <Stack gap="5" py="8">
                  <Text fontSize="5xl">✦</Text>
                  <Heading
                    fontFamily="var(--font-display), serif"
                    fontSize="4xl"
                    fontWeight="500"
                  >
                    Solicitud recibida.
                  </Heading>
                  <Text color="var(--muted)">
                    Guardamos tu lugar tentativo. El estudio va a contactarte
                    para confirmar la sesión.
                  </Text>
                  <Text
                    fontSize="xs"
                    color="var(--muted)"
                    wordBreak="break-all"
                  >
                    Referencia: {success}
                  </Text>
                  <Button
                    type="button"
                    onClick={() => window.location.reload()}
                    variant="outline"
                    borderColor="var(--line)"
                    color="var(--ink)"
                  >
                    Hacer otra solicitud
                  </Button>
                </Stack>
              ) : (
                <Stack gap="7">
                  <Box>
                    <Text
                      fontSize="xs"
                      fontWeight="700"
                      letterSpacing="0.1em"
                      color="var(--accent-dark)"
                    >
                      01 / TU SESIÓN
                    </Text>
                    <Heading mt="2" fontSize="2xl">
                      Encontrá tu momento
                    </Heading>
                  </Box>
                  {error && (
                    <Alert.Root status="error" borderRadius="12px">
                      <Alert.Indicator />
                      <Alert.Content>
                        <Alert.Title>Algo salió mal</Alert.Title>
                        <Alert.Description>{error}</Alert.Description>
                      </Alert.Content>
                    </Alert.Root>
                  )}
                  <SimpleGrid columns={{ base: 1, sm: 2 }} gap="4">
                    <Box>
                      <Text fontSize="sm" fontWeight="600" mb="2">
                        Artista
                      </Text>
                      <select
                        className="field"
                        value={artistId}
                        onChange={(event) => setArtistId(event.target.value)}
                      >
                        <option value="">Elegí un artista</option>
                        {artists.map((artist) => (
                          <option key={artist.id} value={artist.id}>
                            {artist.name}
                          </option>
                        ))}
                      </select>
                    </Box>
                    <Box>
                      <Text fontSize="sm" fontWeight="600" mb="2">
                        Fecha
                      </Text>
                      <Input
                        className="field"
                        type="date"
                        min={minDate}
                        value={date}
                        onChange={(event) => setDate(event.target.value)}
                      />
                    </Box>
                  </SimpleGrid>
                  <Box>
                    <Text fontSize="sm" fontWeight="600" mb="3">
                      Horarios disponibles
                    </Text>
                    {loadingSlots ? (
                      <Spinner size="sm" color="var(--accent)" />
                    ) : !date ? (
                      <Text color="var(--muted)" fontSize="sm">
                        Elegí una fecha para ver los horarios.
                      </Text>
                    ) : slots.length === 0 ? (
                      <Text color="var(--muted)" fontSize="sm">
                        No hay horarios disponibles ese día.
                      </Text>
                    ) : (
                      <SimpleGrid columns={{ base: 3, sm: 4 }} gap="2">
                        {slots.map((slot) => (
                          <Button
                            key={slot.startsAt}
                            type="button"
                            size="sm"
                            variant={
                              selectedSlot?.startsAt === slot.startsAt
                                ? "solid"
                                : "outline"
                            }
                            colorPalette={
                              selectedSlot?.startsAt === slot.startsAt
                                ? "orange"
                                : "gray"
                            }
                            onClick={() => setSelectedSlot(slot)}
                          >
                            {new Date(slot.startsAt).toLocaleTimeString(
                              "es-AR",
                              { hour: "2-digit", minute: "2-digit" },
                            )}
                          </Button>
                        ))}
                      </SimpleGrid>
                    )}
                  </Box>
                  <Box borderTop="1px solid var(--line)" pt="6">
                    <Text
                      fontSize="xs"
                      fontWeight="700"
                      letterSpacing="0.1em"
                      color="var(--accent-dark)"
                      mb="4"
                    >
                      02 / TU IDEA
                    </Text>
                    <Stack gap="4">
                      <SimpleGrid columns={{ base: 1, sm: 2 }} gap="4">
                        <Box>
                          <Text fontSize="sm" fontWeight="600" mb="2">
                            Estilo
                          </Text>
                          <select
                            className="field"
                            value={form.tattooStyle}
                            onChange={(event) =>
                              updateForm("tattooStyle", event.target.value)
                            }
                          >
                            <option value="BLACK_AND_WHITE">
                              Black & white
                            </option>
                            <option value="COLOR">Color</option>
                          </select>
                        </Box>
                        <Box>
                          <Text fontSize="sm" fontWeight="600" mb="2">
                            Tamaño
                          </Text>
                          <select
                            className="field"
                            value={form.size}
                            onChange={(event) =>
                              updateForm("size", event.target.value)
                            }
                          >
                            <option value="SMALL">Pequeño</option>
                            <option value="MEDIUM">Mediano</option>
                            <option value="LARGE">Grande</option>
                          </select>
                        </Box>
                      </SimpleGrid>
                      <Input
                        placeholder="Zona del cuerpo"
                        value={form.bodyArea}
                        onChange={(event) =>
                          updateForm("bodyArea", event.target.value)
                        }
                        required
                      />
                      <Textarea
                        placeholder="Contanos brevemente qué tenés en mente (opcional)"
                        value={form.description}
                        onChange={(event) =>
                          updateForm("description", event.target.value)
                        }
                        rows={3}
                      />
                    </Stack>
                  </Box>
                  <Box borderTop="1px solid var(--line)" pt="6">
                    <Text
                      fontSize="xs"
                      fontWeight="700"
                      letterSpacing="0.1em"
                      color="var(--accent-dark)"
                      mb="4"
                    >
                      03 / TUS DATOS
                    </Text>
                    <Stack gap="4">
                      <SimpleGrid columns={{ base: 1, sm: 2 }} gap="4">
                        <Input
                          placeholder="Nombre completo"
                          value={form.name}
                          onChange={(event) =>
                            updateForm("name", event.target.value)
                          }
                          required
                        />
                        <Input
                          placeholder="Teléfono"
                          value={form.phone}
                          onChange={(event) =>
                            updateForm("phone", event.target.value)
                          }
                          required
                        />
                      </SimpleGrid>
                      <Input
                        type="email"
                        placeholder="Email (opcional)"
                        value={form.email}
                        onChange={(event) =>
                          updateForm("email", event.target.value)
                        }
                      />
                    </Stack>
                  </Box>
                  <Button
                    type="submit"
                    loading={submitting}
                    loadingText="Enviando solicitud"
                    size="lg"
                    background="var(--accent)"
                    color="white"
                    _hover={{ background: "var(--accent-dark)" }}
                    borderRadius="10px"
                  >
                    Solicitar turno <span aria-hidden="true">↗</span>
                  </Button>
                  <Text fontSize="xs" color="var(--muted)" textAlign="center">
                    Tu turno queda pendiente hasta que el estudio lo confirme.
                  </Text>
                </Stack>
              )}
            </Box>
          </SimpleGrid>
        </Container>
      </Box>
    </ChakraProvider>
  );
}
