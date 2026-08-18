#!/bin/sh

/bin/ollama serve &
pid=$!

i=0
until /bin/ollama list >/dev/null 2>&1; do
	i=$((i + 1))
	if [ "$i" -gt 60 ]; then
		echo "ollama did not start" >&2
		exit 1
	fi
	sleep 1
done

/bin/ollama pull "${OLLAMA_CHAT_MODEL:-llama3.2}"
/bin/ollama pull "${OLLAMA_VISION_MODEL:-llava}"

wait "$pid"
