FROM mono:latest
WORKDIR /app
COPY . .
RUN mcs -out:UltraTransfer.exe Program.cs
EXPOSE 10000
ENV PORT=10000
CMD ["mono", "UltraTransfer.exe"]
