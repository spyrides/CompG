const canvas = document.getElementById("canvas");
const gl = canvas.getContext("webgl2");

if (!gl) throw new Error("WebGL 2 não é suportado.");

const vertexShaderSource = `#version 300 es
in vec2 aPosition;
uniform mat3 u_viewTransform;
uniform mat3 u_modelTransform;
void main() {
    vec3 position = u_viewTransform * u_modelTransform * vec3(aPosition, 1.0);
    gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

const fragmentShaderSource = `#version 300 es
precision mediump float;
uniform vec3 uColor;
out vec4 outColor;
void main() {
    outColor = vec4(uColor, 1.0);
}`;

function createShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        throw new Error(gl.getShaderInfoLog(shader));
    }
    return shader;
}

function createProgram(gl, vertexShaderSource, fragmentShaderSource) {
    const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
    const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);
    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        throw new Error(gl.getProgramInfoLog(program));
    }
    return program;
}

const program = createProgram(gl, vertexShaderSource, fragmentShaderSource);

// ==================================================
// CLASSE RENDERER
// ==================================================
class Renderer {
    constructor(gl, program) {
        this.gl = gl;
        this.program = program;
        this.positionLocation = gl.getAttribLocation(program, "aPosition");
        this.colorLocation = gl.getUniformLocation(program, "uColor");
        this.viewTransformLocation = gl.getUniformLocation(program, "u_viewTransform");
        this.modelTransformLocation = gl.getUniformLocation(program, "u_modelTransform");
        this.viewTransform = m3.identity();
        this.verticesBuffer = gl.createBuffer();
    }

    defineViewTransform(viewTransform) {
        this.viewTransform = viewTransform;
    }

    draw(object) {
        const gl = this.gl;
        gl.bindBuffer(gl.ARRAY_BUFFER, this.verticesBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, object.vertices, gl.STATIC_DRAW);
        gl.enableVertexAttribArray(this.positionLocation);
        gl.vertexAttribPointer(this.positionLocation, 2, gl.FLOAT, false, 0, 0);
        gl.uniform3fv(this.colorLocation, object.color);
        gl.uniformMatrix3fv(this.modelTransformLocation, false, object.modelTransform);
        gl.uniformMatrix3fv(this.viewTransformLocation, false, this.viewTransform);
        gl.drawArrays(gl.TRIANGLES, 0, object.vertices.length / 2);
    }
}

// ==================================================
// FUNÇÕES AUXILIARES (Geradores de Geometria)
// ==================================================
function rectangleVertices(x, y, width, height) {
    return [
        x, y,
        x + width, y + height,
        x, y + height,
        x, y,
        x + width, y,
        x + width, y + height
    ];
}

// ==================================================
// CLASSE BASE DOS OBJETOS
// ==================================================
class SceneObject {
    constructor(vertices, color) {
        this.vertices = vertices;
        this.color = color;
        this.modelTransform = m3.identity();
    }
    updateModelTransform(modelTransform) {
        this.modelTransform = modelTransform;
    }
}

// ==================================================
// PARTES DO ROBÔ
// ==================================================
// Criamos uma classe genérica para qualquer parte do corpo
class RobotPart extends SceneObject {
    constructor(vertices, color) {
        super(vertices, color);
    }
}

// ==================================================
// O ROBÔ COMPLETO (Montagem e Animação Hierárquica)
// ==================================================
class Robot {
    constructor(tx, ty) {
        this.tx = tx; // Posição Global X
        this.ty = ty; // Posição Global Y
        
        // Variáveis de animação
        this.speed = 0.01;      // Velocidade de caminhada
        this.swingAngle = 0;    // Ângulo atual de rotação dos membros
        this.swingDir = 1;      // Direção do balanço (frente/trás)
        this.swingSpeed = 0.05; // Velocidade do balanço dos braços/pernas

        // Cores
        const colorBody = new Float32Array([0.2, 0.6, 0.8]); // Azul
        const colorLimbs = new Float32Array([0.7, 0.7, 0.7]); // Cinza
        const colorHead = new Float32Array([0.9, 0.8, 0.2]); // Amarelo

        // Instanciando as partes com seus formatos retangulares
        // Nota: Braços e pernas são desenhados de Y=0 para baixo, 
        // para que o pivô de rotação (0,0) fique no ombro/virilha.
        this.body = new RobotPart(new Float32Array(rectangleVertices(-0.15, -0.2, 0.3, 0.4)), colorBody);
        this.head = new RobotPart(new Float32Array(rectangleVertices(-0.1, 0.0, 0.2, 0.2)), colorHead);
        this.leftArm = new RobotPart(new Float32Array(rectangleVertices(-0.05, -0.3, 0.1, 0.3)), colorLimbs);
        this.rightArm = new RobotPart(new Float32Array(rectangleVertices(-0.05, -0.3, 0.1, 0.3)), colorLimbs);
        this.leftLeg = new RobotPart(new Float32Array(rectangleVertices(-0.06, -0.4, 0.12, 0.4)), colorLimbs);
        this.rightLeg = new RobotPart(new Float32Array(rectangleVertices(-0.06, -0.4, 0.12, 0.4)), colorLimbs);
    }

    move() {
        // 1. Movimento Global (Anda de um lado pro outro na tela)
        this.tx += this.speed;
        if (this.tx > 1.8 || this.tx < -1.8) {
            this.speed = -this.speed;
        }

        // Simula um pulinho ao andar (pequeno movimento vertical no Y)
        let bobbing = Math.abs(Math.sin(this.swingAngle * 2)) * 0.05;

        // 2. Lógica do Pêndulo (Balanço dos braços e pernas)
        this.swingAngle += this.swingSpeed * this.swingDir;
        if (this.swingAngle > 0.8 || this.swingAngle < -0.8) {
            this.swingDir *= -1; // Inverte o balanço ao atingir o limite
        }

        // 3. Aplicando as Transformações Hierárquicas
        // Transformação Pai (Matriz Global do Corpo)
        const globalTransform = m3.translation(this.tx, this.ty + bobbing);
        this.body.updateModelTransform(globalTransform);

        // Cabeça (Pai + Translação pra cima)
        const headLocal = m3.translation(0.0, 0.2); // Sobe relativo ao corpo
        this.head.updateModelTransform(m3.multiply(globalTransform, headLocal));

        // Braço Esquerdo (Pai + Posiciona no ombro + Rotação)
        const leftArmLocal = m3.multiply(m3.translation(-0.2, 0.15), m3.rotation(this.swingAngle));
        this.leftArm.updateModelTransform(m3.multiply(globalTransform, leftArmLocal));

        // Braço Direito (Gira invertido em relação ao esquerdo)
        const rightArmLocal = m3.multiply(m3.translation(0.2, 0.15), m3.rotation(-this.swingAngle));
        this.rightArm.updateModelTransform(m3.multiply(globalTransform, rightArmLocal));

        // Perna Esquerda (Gira invertida em relação ao braço esquerdo para simular caminhada)
        const leftLegLocal = m3.multiply(m3.translation(-0.08, -0.2), m3.rotation(-this.swingAngle));
        this.leftLeg.updateModelTransform(m3.multiply(globalTransform, leftLegLocal));

        // Perna Direita
        const rightLegLocal = m3.multiply(m3.translation(0.08, -0.2), m3.rotation(this.swingAngle));
        this.rightLeg.updateModelTransform(m3.multiply(globalTransform, rightLegLocal));
    }

    draw(renderer) {
        // A ordem de desenho importa para definir quem fica na frente.
        renderer.draw(this.leftArm);
        renderer.draw(this.leftLeg);
        renderer.draw(this.rightLeg);
        renderer.draw(this.body);
        renderer.draw(this.head);
        renderer.draw(this.rightArm);
    }
}

// ==================================================
// CLASSE SCENE (Controla todo o jogo)
// ==================================================
class Scene {
    constructor(gl, program) {
        this.renderer = new Renderer(gl, program);
        this.viewTransform = m3.setClippingWindow(-2.0, -1.0, 2.0, 1.0);
        this.renderer.defineViewTransform(this.viewTransform);

        // Cria o nosso robô no centro da tela
        this.robot = new Robot(0.0, 0.0);
    }

    update() {
        this.robot.move();
    }

    draw() {
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.useProgram(program);
        this.robot.draw(this.renderer);
    }

    execute() {
        this.update();
        this.draw();
        requestAnimationFrame(() => this.execute());
    }

    init() {
        requestAnimationFrame(() => this.execute());
    }
}

// ==================================================
// CONFIGURAÇÃO INICIAL DO WEBGL E EXECUÇÃO
// ==================================================
gl.clearColor(0.2, 0.2, 0.2, 1.0);
gl.viewport(0, 0, canvas.width, canvas.height);

const scene = new Scene(gl, program);
scene.init();
